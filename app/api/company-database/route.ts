// app/api/company-database/route.ts
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { NextResponse } from 'next/server';

interface CompanyData {
  name: string;
  paymentLink: string;
  claimLink: string;
  claimPhone: string;
}

interface CompanyDatabase {
  [key: string]: CompanyData;
}

interface ExcelRow {
  'Company Name'?: string | number;
  'Payment Link'?: string | number;
  'Claim Link'?: string | number;
  'Claim Phone'?: string | number;
}

let cachedCompanyData: CompanyDatabase | null = null;
let lastModified: number | null = null;

function getCompanyDatabasePath() {
  const possiblePaths = [
    path.join(process.cwd(), 'app', 'data', 'company_database.xlsx'),
    path.join(process.cwd(), 'data', 'company_database.xlsx'),
    path.join(process.cwd(), 'public', 'data', 'company_database.xlsx'),
  ];

  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      console.log('Found Excel file at:', filePath);
      return filePath;
    }
  }
 
  throw new Error('Company database file not found');
}

function loadCompanyDatabase(): CompanyDatabase {
  const filePath = getCompanyDatabasePath();
  const stats = fs.statSync(filePath);
  const fileModified = stats.mtime.getTime();
 
  if (cachedCompanyData && lastModified === fileModified) {
    return cachedCompanyData;
  }
 
  const fileBuffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(fileBuffer);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json<ExcelRow>(worksheet, { defval: '' });
 
  const companyDatabase: CompanyDatabase = {};
 
  rawData.forEach((row) => {
    const companyName = row['Company Name']?.toString().trim();
    if (!companyName) return;
   
    companyDatabase[companyName] = {
      name: companyName,
      paymentLink: row['Payment Link']?.toString().trim() || '',
      claimLink: row['Claim Link']?.toString().trim() || '',
      claimPhone: row['Claim Phone']?.toString().trim() || ''
    };
  });
 
  cachedCompanyData = companyDatabase;
  lastModified = fileModified;
 
  return companyDatabase;
}

export async function GET() {
  try {
    const companyDatabase = loadCompanyDatabase();
   
    return NextResponse.json({
      companies: companyDatabase,
      meta: {
        totalCompanies: Object.keys(companyDatabase).length
      }
    });
  } catch (error) {
    console.error('GET Error:', error);
    return NextResponse.json({
      error: 'Failed to load company database',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}