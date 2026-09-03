const EmailSendLog = require('../models/EmailSendLog');

const DAILY_EMAIL_LIMIT = 50;
const CALENDAR_OFFSET_MINUTES = 330;
const RESERVATION_TTL_MS = 10 * 60 * 1000;

const getDayWindow = (now = new Date()) => {
  const offsetMs = CALENDAR_OFFSET_MINUTES * 60 * 1000;
  const localTime = new Date(now.getTime() + offsetMs);
  const localStartAsUtc = Date.UTC(
    localTime.getUTCFullYear(),
    localTime.getUTCMonth(),
    localTime.getUTCDate()
  );
  const start = new Date(localStartAsUtc - offsetMs);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const dayKey = [
    localTime.getUTCFullYear(),
    String(localTime.getUTCMonth() + 1).padStart(2, '0'),
    String(localTime.getUTCDate()).padStart(2, '0')
  ].join('-');
  return { start, end, dayKey };
};

const getDailyLimitStatus = async (userId, now = new Date()) => {
  const { start, end, dayKey } = getDayWindow(now);
  const [emailsSentToday, activeReservations] = await Promise.all([
    EmailSendLog.countDocuments({
      userId,
      status: 'success',
      sentAt: { $gte: start, $lt: end }
    }),
    EmailSendLog.countDocuments({
      userId,
      dayKey,
      status: 'pending',
      reservationExpiresAt: { $gt: now }
    })
  ]);
  const occupiedSlots = Math.min(DAILY_EMAIL_LIMIT, emailsSentToday + activeReservations);
  return {
    dailyLimit: DAILY_EMAIL_LIMIT,
    emailsSentToday,
    emailsRemaining: Math.max(0, DAILY_EMAIL_LIMIT - occupiedSlots),
    canSend: occupiedSlots < DAILY_EMAIL_LIMIT
  };
};

const reserveDailyEmailSlot = async ({ userId, leadId, pocId, recipientEmail, subject, now = new Date() }) => {
  const { dayKey } = getDayWindow(now);
  await EmailSendLog.deleteMany({
    userId,
    dayKey,
    status: 'pending',
    reservationExpiresAt: { $lte: now }
  });
  const occupied = await EmailSendLog.find({
    userId,
    dayKey,
    $or: [
      { status: 'success' },
      { status: 'pending', reservationExpiresAt: { $gt: now } }
    ]
  }).select('dailySlot').lean();
  const occupiedSlots = new Set(occupied.map(record => record.dailySlot));

  for (let dailySlot = 1; dailySlot <= DAILY_EMAIL_LIMIT; dailySlot += 1) {
    if (occupiedSlots.has(dailySlot)) continue;
    try {
      const reservation = await EmailSendLog.create({
        userId,
        leadId: leadId || null,
        pocId: pocId || null,
        recipientEmail,
        subject,
        sentAt: now,
        status: 'pending',
        dayKey,
        dailySlot,
        reservationExpiresAt: new Date(now.getTime() + RESERVATION_TTL_MS)
      });
      const status = await getDailyLimitStatus(userId, now);
      return { allowed: true, reservation, status };
    } catch (error) {
      if (error?.code === 11000) continue;
      throw error;
    }
  }

  return { allowed: false, status: await getDailyLimitStatus(userId, now) };
};

const completeDailyEmailReservation = async (reservationId, sentAt = new Date()) => {
  const result = await EmailSendLog.findOneAndUpdate(
    { _id: reservationId, status: 'pending' },
    { $set: { status: 'success', sentAt }, $unset: { reservationExpiresAt: 1 } },
    { new: true }
  );
  if (!result) throw new Error('Email send reservation could not be completed.');
  return result;
};

const releaseDailyEmailReservation = async (reservationId) => {
  if (reservationId) await EmailSendLog.deleteOne({ _id: reservationId, status: 'pending' });
};

const logDailyLimitDecision = ({ userId, status, allowed, timestamp = new Date() }) => {
  console.info('Daily email limit check', {
    userId: String(userId),
    emailsSentToday: status.emailsSentToday,
    emailsRemaining: status.emailsRemaining,
    allowed,
    timestamp: timestamp.toISOString()
  });
};

module.exports = {
  DAILY_EMAIL_LIMIT,
  getDayWindow,
  getDailyLimitStatus,
  reserveDailyEmailSlot,
  completeDailyEmailReservation,
  releaseDailyEmailReservation,
  logDailyLimitDecision
};
