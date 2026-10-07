import type { OrgStructure, CustomFieldDefinition } from '../types';

export const GRADE_SCALES = [
  'JG-04 (General Worker)',
  'JG-06 (Skilled Operative)',
  'JG-08 (Technical Specialist)',
  'JG-10 (Supervisor)',
  'JG-12 (Manager)',
  'JG-14 (Senior Manager)'
];

export const KENYAN_BANKS = [
  'Equity Bank',
  'KCB Bank',
  'Co-operative Bank',
  'NCBA Bank',
  'Absa Bank Kenya',
  'Standard Chartered',
  'Stanbic Bank',
  'I&M Bank',
  'Diamond Trust Bank',
  'Family Bank',
  'National Bank of Kenya'
];

// Starter structure; companies extend it from the Add Employee wizard.
export const INITIAL_ORG_STRUCTURE: OrgStructure = {
  branches: [
    { id: 'br-hq', name: 'Corporate HQ Nairobi', location: 'Upper Hill, Nairobi' },
    { id: 'br-khe', name: 'Kericho Highland Estates', location: 'Kericho' },
    { id: 'br-kf1', name: 'Kericho Factory Unit 1', location: 'Kericho' },
    { id: 'br-nho', name: 'Nandi Hills Outgrowers', location: 'Nandi Hills' },
    { id: 'br-rva', name: 'Rift Valley Agricultural Holding', location: 'Nakuru' }
  ],
  stations: [
    { id: 'st-hq-main', name: 'Head Office', branchId: 'br-hq' },
    { id: 'st-khe-main', name: 'Main Site', branchId: 'br-khe' },
    { id: 'st-khe-c', name: 'Site C', branchId: 'br-khe' },
    { id: 'st-khe-d', name: 'Site D', branchId: 'br-khe' },
    { id: 'st-kf1-boiler', name: 'Boiler House', branchId: 'br-kf1' },
    { id: 'st-kf1-lab', name: 'Quality Lab', branchId: 'br-kf1' },
    { id: 'st-nho-main', name: 'Service Centre', branchId: 'br-nho' }
  ],
  departments: [
    { id: 'dp-ops', name: 'Operations', costCenter: 'CC-100' },
    { id: 'dp-pqc', name: 'Production & Quality Control', costCenter: 'CC-200' },
    { id: 'dp-gs', name: 'General Services', costCenter: 'CC-300' },
    { id: 'dp-fin', name: 'Finance & Administration', costCenter: 'CC-400' },
    { id: 'dp-sm', name: 'Sales & Marketing', costCenter: 'CC-500' },
    { id: 'dp-it', name: 'Information Technology', costCenter: 'CC-600' },
    { id: 'dp-hr', name: 'Human Resources', costCenter: 'CC-700' },
    { id: 'dp-osh', name: 'OSH & Compliance', costCenter: 'CC-800' },
    { id: 'dp-eng', name: 'Engineering & Maintenance', costCenter: 'CC-900' }
  ],
  sections: [
    { id: 'sc-hr-rec', name: 'Recruitment', departmentId: 'dp-hr' },
    { id: 'sc-hr-pay', name: 'Payroll', departmentId: 'dp-hr' },
    { id: 'sc-hr-er', name: 'Employee Relations', departmentId: 'dp-hr' },
    { id: 'sc-ops-a', name: 'Production Line A', departmentId: 'dp-ops' },
    { id: 'sc-ops-log', name: 'Logistics', departmentId: 'dp-ops' },
    { id: 'sc-fin-ap', name: 'Accounts Payable', departmentId: 'dp-fin' },
    { id: 'sc-fin-tr', name: 'Treasury', departmentId: 'dp-fin' },
    { id: 'sc-it-inf', name: 'Infrastructure', departmentId: 'dp-it' },
    { id: 'sc-it-app', name: 'Applications', departmentId: 'dp-it' }
  ],
  designations: [
    {
      id: 'ds-hrm',
      title: 'Group HR Manager',
      grade: 'JG-12 (Manager)',
      departmentId: 'dp-hr',
      jobDescription: {
        reportsTo: 'HR Director',
        workLocation: 'Corporate HQ Nairobi',
        vacancyReason: 'New Position',
        replacingEmployee: '',
        jobPurpose: 'Lead HR operations across the group, ensuring compliant payroll, effective recruitment and positive employee relations.',
        responsibilities: [
          'Oversee monthly payroll and statutory remittances',
          'Lead recruitment and onboarding for all branches',
          'Advise managers on employee relations and discipline',
          'Report HR metrics to executive management'
        ],
        educationLevel: "Bachelor's Degree",
        minExperienceYears: 7,
        skills: ['Employment law', 'Payroll', 'Stakeholder management'],
        certifications: 'CHRP (K)',
        workingHours: 'Mon–Fri, 8:00–17:00',
        travelRequired: true
      }
    },
    {
      id: 'ds-payroll',
      title: 'Payroll Officer',
      grade: 'JG-08 (Technical Specialist)',
      departmentId: 'dp-hr',
      jobDescription: {
        reportsTo: 'Group HR Manager',
        workLocation: 'Corporate HQ Nairobi',
        vacancyReason: 'New Position',
        replacingEmployee: '',
        jobPurpose: 'Process accurate and timely payroll for all employees.',
        responsibilities: ['Capture monthly payroll inputs', 'Reconcile statutory deductions', 'Answer staff payroll queries'],
        educationLevel: 'Diploma',
        minExperienceYears: 3,
        skills: ['Payroll systems', 'Excel', 'Attention to detail'],
        certifications: 'CPA Part II',
        workingHours: 'Mon–Fri, 8:00–17:00',
        travelRequired: false
      }
    },
    { id: 'ds-ops-analyst', title: 'Senior Operations Analyst', grade: 'JG-10 (Supervisor)', departmentId: 'dp-ops' },
    { id: 'ds-supervisor', title: 'Team Supervisor', grade: 'JG-06 (Skilled Operative)', departmentId: 'dp-ops' },
    {
      id: 'ds-operative',
      title: 'Production Operative',
      grade: 'JG-04 (General Worker)',
      departmentId: 'dp-ops',
      jobDescription: {
        reportsTo: 'Team Supervisor',
        workLocation: 'Main Site',
        vacancyReason: 'Expansion',
        replacingEmployee: '',
        jobPurpose: 'Carry out daily production tasks safely and to quality standards.',
        responsibilities: ['Operate assigned equipment', 'Record daily output', 'Follow safety procedures'],
        educationLevel: 'KCSE Certificate',
        minExperienceYears: 0,
        skills: ['Teamwork', 'Safety awareness'],
        certifications: '',
        workingHours: 'Shift work',
        travelRequired: false
      }
    },
    { id: 'ds-inventory', title: 'Inventory Clerk', grade: 'JG-04 (General Worker)', departmentId: 'dp-ops' },
    { id: 'ds-qa', title: 'Quality Assurance Analyst', grade: 'JG-08 (Technical Specialist)', departmentId: 'dp-pqc' },
    { id: 'ds-accountant', title: 'Accountant', grade: 'JG-08 (Technical Specialist)', departmentId: 'dp-fin' },
    { id: 'ds-it-tech', title: 'IT Support Technician', grade: 'JG-06 (Skilled Operative)', departmentId: 'dp-it' }
  ]
};

export const INITIAL_CUSTOM_FIELDS: CustomFieldDefinition[] = [
  {
    id: 'cf-blood-group',
    label: 'Blood group',
    type: 'select',
    group: 'personal',
    required: false,
    options: ['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'],
    helpText: 'Used by the first-aid team in emergencies.'
  }
];
