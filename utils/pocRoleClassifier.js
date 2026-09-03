const ROLE_RULES = [
  ['Talent Acquisition', /\b(talent acquisition|talent partner|talent lead|head of talent|recruitment lead)\b/i],
  ['Recruitment', /\b(recruiter|recruitment|staffing|sourcing specialist)\b/i],
  ['HR', /\b(human resources|people operations|people partner|hrbp|hr manager|head of hr|chief people officer|chro|hr)\b/i],
  ['Founder', /\b(co[- ]?founder|founder|owner|entrepreneur)\b/i],
  ['CEO', /\b(chief executive officer|ceo|managing director)\b/i],
  ['Engineering', /\b(chief technology officer|cto|vp engineering|head of engineering|engineering manager|engineering director|director of engineering|technical director|technology leader|software engineering)\b/i],
  ['Sales', /\b(chief revenue officer|cro|vp sales|head of sales|sales director|sales manager|business development)\b/i],
  ['Marketing', /\b(chief marketing officer|cmo|vp marketing|head of marketing|marketing director|marketing manager|growth marketing)\b/i],
  ['Director', /\b(director|vice president|vp)\b/i],
  ['Manager', /\b(manager|team lead|department head|head of)\b/i]
];

const DEPARTMENT_BY_ROLE = {
  'Talent Acquisition': 'Talent Acquisition', Recruitment: 'Recruitment', HR: 'Human Resources',
  Founder: 'Executive Leadership', CEO: 'Executive Leadership', Engineering: 'Engineering',
  Sales: 'Sales', Marketing: 'Marketing', Director: 'Leadership', Manager: 'Management'
};

function classifyPocRole({ designation, department, linkedInUrl, publicResearch }) {
  const linkedInEvidence = linkedInUrl
    ? (publicResearch?.evidenceByCategory?.decisionMakers || []).map(item => `${item.title} ${item.snippet}`).join(' ')
    : '';
  const evidence = [designation, department, linkedInEvidence].filter(Boolean).join(' ');
  const roleCategory = ROLE_RULES.find(([, pattern]) => pattern.test(evidence))?.[0] || 'Unknown';
  return {
    roleCategory,
    department: department || DEPARTMENT_BY_ROLE[roleCategory] || '',
    classificationBasis: designation ? 'CRM designation' : linkedInEvidence ? 'Google-indexed LinkedIn evidence' : 'Insufficient role evidence'
  };
}

module.exports = { classifyPocRole };
