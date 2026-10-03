const escapePdfText = (value = '') => String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

const formatTime = (value) => new Date(value).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit'
});

const addLine = (lines, text = '', size = 10, leading = 14) => {
    lines.push({ text, size, leading });
};

const addSection = (lines, title) => {
    addLine(lines, '');
    addLine(lines, title, 14, 18);
};

const buildReportLines = (report) => {
    const lines = [];
    addLine(lines, report.title, 18, 24);
    addLine(lines, `${report.displayDate} | ${formatTime(report.periodStart)} - ${formatTime(report.periodEnd)} IST`, 10, 16);

    addSection(lines, 'CEO Summary');
    Object.entries(report.summary || {}).forEach(([key, value]) => {
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
        addLine(lines, `${label}: ${value}`);
    });

    addSection(lines, 'BD Executive Performance');
    addLine(lines, 'BD Executive | Assigned | New Leads | Companies | POCs | Calls | Follow-ups | Outreach | Meetings | Won | Lost | Onboarded', 8, 12);
    (report.executiveRows || []).forEach((row) => {
        addLine(
            lines,
            `${row.name} | ${row.assignedLeads} | ${row.newLeadsToday} | ${row.companiesToday} | ${row.pocsToday} | ${row.callsToday} | ${row.followupsToday} | ${row.outreachToday} | ${row.meetingsToday} | ${row.won} | ${row.lost} | ${row.onboarded}`,
            8,
            12
        );
    });

    addSection(lines, 'Lead Activity');
    Object.entries(report.leadActivity || {}).forEach(([key, value]) => {
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
        addLine(lines, `${label}: ${value}`);
    });

    addSection(lines, 'Stage Changes Today');
    Object.entries(report.stageChanges || {}).forEach(([stage, value]) => {
        addLine(lines, `${stage}: ${value}`);
    });

    addSection(lines, 'Calls Today');
    addLine(lines, `Total Calls: ${report.calls?.total || 0}`);
    Object.entries(report.calls?.byExecutive || {}).forEach(([name, value]) => {
        addLine(lines, `${name}: ${value}`);
    });

    addSection(lines, 'Follow-up Activity');
    (report.followups || []).forEach((row) => {
        addLine(lines, `${row.bdExecutive}: completed ${row.completed}, pending ${row.pending}`);
    });

    addSection(lines, 'Meetings / Bookings');
    addLine(lines, `Booked: ${report.meetings?.booked || 0}, Completed: ${report.meetings?.completed || 0}, Upcoming: ${report.meetings?.upcoming || 0}`);
    (report.meetings?.rows || []).slice(0, 20).forEach((row) => {
        addLine(lines, `${row.company} | ${row.bdExecutive} | ${formatTime(row.meetingTime)} | ${row.stage}`);
    });

    addSection(lines, "Today's Outcome");
    addLine(lines, `Won: ${report.summary?.won || 0}`);
    addLine(lines, `Lost: ${report.summary?.lost || 0}`);
    addLine(lines, `Onboarded: ${report.summary?.onboarded || 0}`);
    addLine(lines, `Proposal Sent: ${report.outcomes?.proposalSent || 0}`);
    addLine(lines, `Negotiation: ${report.outcomes?.negotiation || 0}`);

    addSection(lines, 'Recent BD Activity');
    (report.recentActivity || []).slice(0, 25).forEach((item) => {
        addLine(lines, `${formatTime(item.time)} - ${item.bdExecutive} - ${item.action} - ${item.company} - ${item.stage}`, 9, 13);
    });

    return lines;
};

const splitText = (text, maxChars) => {
    const words = String(text).split(/\s+/);
    const rows = [];
    let current = '';
    words.forEach((word) => {
        if ((current + ' ' + word).trim().length > maxChars) {
            rows.push(current);
            current = word;
        } else {
            current = (current + ' ' + word).trim();
        }
    });
    if (current) rows.push(current);
    return rows.length ? rows : [''];
};

const renderPdfReport = (report) => {
    const pageWidth = 595;
    const pageHeight = 842;
    const margin = 42;
    const usableWidth = pageWidth - (margin * 2);
    const lines = buildReportLines(report);
    const pages = [];
    let currentPage = [];
    let y = pageHeight - margin;

    lines.forEach((line) => {
        const maxChars = Math.max(35, Math.floor(usableWidth / (line.size * 0.52)));
        const wrapped = splitText(line.text, maxChars);
        wrapped.forEach((text, index) => {
            const leading = index === 0 ? line.leading : line.leading - 1;
            if (y - leading < margin) {
                pages.push(currentPage);
                currentPage = [];
                y = pageHeight - margin;
            }
            currentPage.push({ text, size: line.size, y });
            y -= leading;
        });
    });
    if (currentPage.length) pages.push(currentPage);

    const objects = [];
    const addObject = (body) => {
        objects.push(body);
        return objects.length;
    };

    const catalogId = addObject('<< /Type /Catalog /Pages 2 0 R >>');
    const pagesId = addObject('');
    const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    const pageIds = [];

    pages.forEach((page) => {
        const commands = [
            'BT',
            `/F1 10 Tf`,
            `${margin} ${pageHeight - margin} Td`
        ];
        let lastY = pageHeight - margin;
        page.forEach((line) => {
            commands.push(`/F1 ${line.size} Tf`);
            commands.push(`0 ${line.y - lastY} Td`);
            commands.push(`(${escapePdfText(line.text)}) Tj`);
            lastY = line.y;
        });
        commands.push('ET');
        const stream = commands.join('\n');
        const contentId = addObject(`<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`);
        const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
        pageIds.push(pageId);
    });

    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

    const chunks = ['%PDF-1.4\n'];
    const offsets = [0];
    objects.forEach((body, index) => {
        offsets.push(Buffer.byteLength(chunks.join(''), 'utf8'));
        chunks.push(`${index + 1} 0 obj\n${body}\nendobj\n`);
    });
    const xrefOffset = Buffer.byteLength(chunks.join(''), 'utf8');
    chunks.push(`xref\n0 ${objects.length + 1}\n`);
    chunks.push('0000000000 65535 f \n');
    offsets.slice(1).forEach((offset) => {
        chunks.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
    });
    chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

    return Buffer.from(chunks.join(''), 'utf8');
};

module.exports = { renderPdfReport };
