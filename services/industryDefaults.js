const clean = (value, max = 300) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);

const unique = values => [...new Set((values || []).map(value => clean(value, 120)).filter(Boolean))];

const INDUSTRY_PROFILES = [
  {
    key: 'interior_design',
    label: 'Interior Design',
    aliases: ['interior design', 'interiors', 'interior designer', 'architecture interiors', 'modular kitchen', 'home decor', 'space planning'],
    pattern: /(interior|interiors|modular kitchen|space planning|home decor|furniture design|3d visuali[sz]er|autocad|sketchup)/i,
    introduction: companyName => `I came across ${companyName} and noticed your work in the Interior Design space, where design quality, visualization, site execution, procurement, and client coordination are all important for delivering projects on time.`,
    roles: [
      'Interior Designer', 'Senior Interior Designer', 'Junior Interior Designer', '3D Visualizer',
      'AutoCAD Designer', 'SketchUp Designer', 'Modular Kitchen Designer', 'Space Planner',
      'Furniture Designer', 'Project Manager', 'Interior Site Supervisor', 'Site Engineer',
      'Civil Engineer', 'Quantity Surveyor', 'Estimation Executive', 'Procurement Executive',
      'Vendor Management Executive', 'Client Relationship Manager'
    ]
  },
  {
    key: 'food_beverages',
    label: 'Food and Beverages',
    aliases: ['food & beverages', 'food and beverage', 'food and beverages', 'fmcg', 'food production', 'food processing', 'food manufacturing', 'packaged foods', 'beverages'],
    pattern: /(food|beverage|fmcg|consumer goods|snack|nutrition|dairy|bakery|qsr|cloud kitchen|packaged foods|food processing|food manufacturing)/i,
    introduction: companyName => `I came across ${companyName} and noticed your presence in the Food and Beverages industry, where production, food safety, quality, packaging, supply chain, distribution, and consumer-facing growth teams can make a real difference.`,
    roles: [
      'Production Manager', 'Production Executive', 'Production Supervisor', 'Food Technologist',
      'Quality Control Executive', 'Quality Assurance Executive', 'Food Safety Officer',
      'Packaging Executive', 'Procurement Executive', 'Supply Chain Executive', 'Warehouse Executive',
      'Inventory Controller', 'Logistics Coordinator', 'Operations Executive', 'Sales Executive',
      'Area Sales Manager', 'Business Development Executive', 'Distributor Management Executive',
      'Brand Manager', 'Marketing Executive', 'E-commerce Executive', 'Accounts Executive',
      'HR Executive', 'Maintenance Engineer'
    ]
  },
  {
    key: 'information_technology',
    label: 'Information Technology',
    aliases: ['information technology', 'it', 'it services', 'software', 'software development', 'saas', 'technology', 'tech'],
    pattern: /(information\s*technology|\bit\b|it\s*services|software|saas|technology|tech|digital product|web development|app development|cloud|product engineering)/i,
    introduction: companyName => `I came across ${companyName} and noticed your work in the Information Technology space, where engineering, product delivery, QA, DevOps, data, support, and project teams are central to scaling reliably.`,
    roles: [
      'Software Developer', 'Software Engineer', 'Frontend Developer', 'Backend Developer',
      'Full Stack Developer', 'QA Engineer', 'DevOps Engineer', 'Cloud Engineer',
      'Data Analyst', 'Data Engineer', 'UI/UX Designer', 'Product Manager',
      'Technical Support Engineer', 'Business Analyst', 'Project Manager'
    ]
  },
  {
    key: 'manufacturing',
    label: 'Manufacturing',
    aliases: ['manufacturing', 'industrial', 'factory', 'production', 'plant operations'],
    pattern: /(manufactur|industrial|factory|automotive|production|plant|machinery|engineering goods|metal|plastic|textile)/i,
    introduction: companyName => `I came across ${companyName} and noticed your manufacturing profile, where production, maintenance, quality control, plant operations, safety, procurement, logistics, and sales hiring directly affect output and customer commitments.`,
    roles: [
      'Production Engineer', 'Production Supervisor', 'Mechanical Engineer', 'Plant Manager',
      'Quality Engineer', 'Quality Control Inspector', 'CNC Operator', 'Maintenance Engineer',
      'Electrical Technician', 'Safety Officer', 'Procurement Executive', 'Store Executive',
      'Plant HR Executive', 'Sales Executive'
    ]
  },
  {
    key: 'healthcare',
    label: 'Healthcare',
    aliases: ['health care', 'healthcare', 'hospital', 'medical', 'clinic', 'diagnostics', 'pharma'],
    pattern: /(health\s*care|healthcare|hospital|medical|pharma|clinic|diagnostic|life sciences|wellness|medtech)/i,
    introduction: companyName => `I came across ${companyName} and noticed your healthcare presence, where dependable clinical, technical, administrative, diagnostics, patient-support, and compliance hiring is critical to service quality.`,
    roles: [
      'Staff Nurse', 'Medical Officer', 'Lab Technician', 'Pharmacist', 'Hospital Administrator',
      'Radiologist', 'Billing Executive', 'Patient Care Coordinator', 'Medical Representative',
      'Front Office Executive', 'Healthcare Operations Executive'
    ]
  },
  {
    key: 'education',
    label: 'Education',
    aliases: ['education', 'edtech', 'training', 'school', 'college', 'university', 'institute', 'academy'],
    pattern: /(education|edtech|training|school|college|university|institute|academy|learning)/i,
    introduction: companyName => `I came across ${companyName} and noticed your work in Education, where academic delivery, admissions, student support, training, marketing, and operations hiring shape learner experience and growth.`,
    roles: [
      'Faculty', 'Teacher', 'Academic Coordinator', 'Admissions Counselor', 'Principal',
      'Trainer', 'Student Counsellor', 'Digital Marketing Executive', 'Telecaller',
      'Operations Executive', 'Office Administrator'
    ]
  },
  {
    key: 'real_estate',
    label: 'Real Estate',
    aliases: ['real estate', 'property', 'brokerage', 'developer', 'residential', 'commercial property'],
    pattern: /(real\s*estate|property|brokerage|developer|residential|commercial property)/i,
    introduction: companyName => `I came across ${companyName} and noticed your Real Estate presence, where sales, customer relations, site coordination, project support, marketing, and CRM teams often drive both customer acquisition and project momentum.`,
    roles: [
      'Sales Executive', 'Property Consultant', 'Channel Sales Manager', 'CRM Executive',
      'Site Coordinator', 'Site Engineer', 'Digital Marketing Executive', 'Telecaller',
      'Client Relationship Manager', 'Legal Executive', 'Operations Executive'
    ]
  },
  {
    key: 'construction',
    label: 'Construction',
    aliases: ['construction', 'infrastructure', 'civil construction', 'epc', 'contractor', 'builder'],
    pattern: /(construction|infrastructure|civil|epc|contractor|builder|project management)/i,
    introduction: companyName => `I came across ${companyName} and noticed your Construction profile, where site execution, civil engineering, project control, safety, procurement, billing, and quantity surveying teams can directly influence timelines and delivery quality.`,
    roles: [
      'Civil Engineer', 'Site Engineer', 'Project Manager', 'Quantity Surveyor',
      'Safety Officer', 'Procurement Executive', 'Billing Engineer', 'Planning Engineer',
      'MEP Engineer', 'Supervisor', 'Store Keeper', 'AutoCAD Draftsman'
    ]
  },
  {
    key: 'ecommerce',
    label: 'E-commerce',
    aliases: ['ecommerce', 'e-commerce', 'marketplace', 'd2c', 'direct to consumer', 'online retail'],
    pattern: /(e-?commerce|marketplace|d2c|direct to consumer|online retail)/i,
    introduction: companyName => `I came across ${companyName} and noticed your E-commerce focus, where catalogue, operations, customer support, warehouse, digital marketing, merchandising, and growth teams need both speed and consistency.`,
    roles: [
      'E-commerce Executive', 'Marketplace Executive', 'Catalog Executive', 'Digital Marketing Executive',
      'Performance Marketing Executive', 'Customer Support Executive', 'Warehouse Executive',
      'Inventory Executive', 'Operations Executive', 'Merchandiser', 'Key Account Manager',
      'Business Development Executive'
    ]
  },
  {
    key: 'financial_services',
    label: 'Financial Services',
    aliases: ['financial services', 'finance', 'bfsi', 'banking', 'nbfc', 'insurance', 'fintech'],
    pattern: /(financial services|finance|financial|bank|bfsi|nbfc|insurance|fintech|accounting|wealth|loan|credit)/i,
    introduction: companyName => `I came across ${companyName} and noticed your Financial Services profile, where relationship management, operations, compliance, sales, finance, and analytical hiring need speed, accuracy, and trust.`,
    roles: [
      'Finance Analyst', 'Accounts Executive', 'Relationship Manager', 'Sales Executive',
      'Operations Executive', 'Credit Analyst', 'Compliance Executive', 'Loan Officer',
      'Insurance Advisor', 'Collection Executive', 'Branch Manager', 'Customer Support Executive'
    ]
  },
  {
    key: 'logistics_supply_chain',
    label: 'Logistics and Supply Chain',
    aliases: ['logistics', 'supply chain', 'warehouse', 'transport', 'freight', 'shipping', 'fleet', '3pl', 'distribution'],
    pattern: /(logistics|supply chain|warehouse|transport|freight|courier|shipping|fleet|3pl|distribution)/i,
    introduction: companyName => `I came across ${companyName} and noticed your Logistics and Supply Chain presence, where warehouse, dispatch, fleet, transport, inventory, and coordination hiring are essential for timely fulfilment.`,
    roles: [
      'Fleet Manager', 'Warehouse Manager', 'Warehouse Executive', 'Dispatch Executive',
      'Transport Coordinator', 'Supply Chain Manager', 'Logistics Coordinator',
      'Inventory Controller', 'Delivery Executive', 'Operations Executive',
      'Procurement Executive', 'Customer Support Executive'
    ]
  },
  {
    key: 'retail',
    label: 'Retail',
    aliases: ['retail', 'store', 'consumer retail', 'fashion retail', 'offline retail'],
    pattern: /(retail|store|fashion|merchandising|consumer retail)/i,
    introduction: companyName => `I came across ${companyName} and noticed your Retail presence, where store operations, customer experience, inventory, merchandising, sales, and regional management hiring usually need consistent execution.`,
    roles: [
      'Store Manager', 'Sales Associate', 'Cashier', 'Inventory Executive', 'Regional Manager',
      'Merchandiser', 'Customer Support Executive', 'Retail Sales Executive',
      'Visual Merchandiser', 'Area Manager', 'Operations Executive'
    ]
  },
  {
    key: 'hospitality',
    label: 'Hospitality',
    aliases: ['hospitality', 'hotel', 'resort', 'travel', 'tourism', 'restaurant', 'catering'],
    pattern: /(hospitality|hotel|resort|travel|tourism|restaurant|catering)/i,
    introduction: companyName => `I came across ${companyName} and noticed your Hospitality profile, where guest-facing, operations, kitchen, housekeeping, sales, and service teams define consistency of experience.`,
    roles: [
      'Front Office Executive', 'Hotel Operations Manager', 'Housekeeping Supervisor',
      'F&B Executive', 'Chef', 'Sales Executive', 'Guest Relations Executive',
      'Reservation Executive', 'Restaurant Manager', 'Steward', 'Travel Consultant'
    ]
  },
  {
    key: 'digital_marketing',
    label: 'Digital Marketing',
    aliases: ['digital marketing', 'marketing agency', 'seo', 'performance marketing', 'social media marketing', 'creative agency'],
    pattern: /(digital marketing|marketing agency|seo|performance marketing|social media|creative agency|content marketing|branding agency)/i,
    introduction: companyName => `I came across ${companyName} and noticed your Digital Marketing focus, where performance, SEO, content, creative, social media, client servicing, and analytics talent can directly impact campaign execution and client outcomes.`,
    roles: [
      'Digital Marketing Executive', 'SEO Executive', 'Performance Marketing Executive',
      'Social Media Manager', 'Content Writer', 'Graphic Designer', 'Video Editor',
      'Account Manager', 'Client Servicing Executive', 'Copywriter', 'Marketing Analyst',
      'Business Development Executive'
    ]
  }
];

const GENERAL_BUSINESS_PROFILE = {
  key: 'general_business_services',
  label: 'General Business Services',
  aliases: ['general business services', 'business services', 'general business'],
  pattern: /(general business|business services|professional services)/i,
  introduction: companyName => `I came across ${companyName} and wanted to share how Jobs Territory can support practical hiring needs across sales, business development, customer support, operations, HR, finance, administration, and growth teams.`,
  roles: [
    'Sales Executive', 'Business Development Executive', 'Customer Support Executive',
    'Operations Executive', 'HR Executive', 'Recruiter', 'Accounts Executive',
    'Digital Marketing Executive', 'Office Administrator', 'Client Relationship Executive'
  ]
};

const ALL_PROFILES = [...INDUSTRY_PROFILES, GENERAL_BUSINESS_PROFILE];

function getIndustryProfile(industryName = '') {
  const normalized = clean(industryName, 240).toLowerCase();
  if (!normalized) return null;
  return ALL_PROFILES.find(profile =>
    profile.pattern.test(normalized) ||
    profile.aliases.some(alias => normalized === alias || normalized.includes(alias) || alias.includes(normalized))
  ) || null;
}

function normalizeIndustryName(industryName = '') {
  const profile = getIndustryProfile(industryName);
  return profile?.label || clean(industryName, 120);
}

function getIndustryDefaultRoles(industryName = '', { limit = 18 } = {}) {
  const profile = getIndustryProfile(industryName) || GENERAL_BUSINESS_PROFILE;
  return unique(profile.roles).slice(0, limit);
}

function getDefaultRolesByIndustry(industryName = '') {
  return getIndustryDefaultRoles(industryName, { limit: 20 });
}

function getIndustryIntroduction({ companyName = 'your company', industryName = '' } = {}) {
  const profile = getIndustryProfile(industryName) || GENERAL_BUSINESS_PROFILE;
  return profile.introduction(clean(companyName, 160) || 'your company');
}

module.exports = {
  INDUSTRY_PROFILES,
  GENERAL_BUSINESS_PROFILE,
  getIndustryProfile,
  normalizeIndustryName,
  getIndustryDefaultRoles,
  getDefaultRolesByIndustry,
  getIndustryIntroduction
};
