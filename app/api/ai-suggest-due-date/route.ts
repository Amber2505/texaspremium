// api/ai-suggest-due-date/route.ts
import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const { companyName, effectiveDate, expirationDate } = await request.json();

    if (!companyName || !effectiveDate) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db('db');

    // Get all customers with the same company
    const similarCustomers = await db
      .collection('payment_reminder_coll')
      .find({
        companyName: { $regex: new RegExp(companyName, 'i') },
      })
      .toArray();

    // Get some customers from other companies for comparison
    const otherCompanyCustomers = await db
      .collection('payment_reminder_coll')
      .find({
        companyName: { $not: { $regex: new RegExp(companyName, 'i') } },
      })
      .limit(10)
      .toArray();

    // Calculate patterns from existing data
    const companyData = similarCustomers.map((customer) => {
      const effDate = new Date(customer.effectiveDate);
      const dueDate = new Date(customer.dueDate);
      const daysDiff = Math.floor(
        (dueDate.getTime() - effDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      return {
        company: customer.companyName,
        paymentType: customer.paymentType,
        effectiveDate: effDate.toISOString().split('T')[0],
        dueDate: dueDate.toISOString().split('T')[0],
        daysBetween: daysDiff,
        totalPayments: customer.totalPayments,
        remainingPayments: customer.remainingPayments,
      };
    });

    const otherCompanyData = otherCompanyCustomers.map((customer) => {
      const effDate = new Date(customer.effectiveDate);
      const dueDate = new Date(customer.dueDate);
      const daysDiff = Math.floor(
        (dueDate.getTime() - effDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      return {
        company: customer.companyName,
        paymentType: customer.paymentType,
        daysBetween: daysDiff,
      };
    });

    // Build the AI prompt
    const prompt = `You are an insurance payment expert analyzing payment patterns for different insurance companies.

**Task:** Predict the best due date and payment type for a new customer based on historical patterns.

**New Customer:**
- Company: ${companyName}
- Effective Date: ${effectiveDate}
- Expiration Date: ${expirationDate || 'Not provided'}

**Historical Data for ${companyName}:**
${companyData.length > 0 ? JSON.stringify(companyData, null, 2) : 'No historical data for this company'}

**Historical Data for Other Companies (for comparison):**
${JSON.stringify(otherCompanyData.slice(0, 5), null, 2)}

**Analysis Required:**
1. Analyze the pattern for ${companyName}:
   - Typical days between effective date and due date
   - Preferred payment type (regular, autopay, paid-in-full)
   - Any special patterns or preferences

2. If no data exists for ${companyName}, compare with similar companies

3. Consider:
   - Industry standards (typically 0-30 days after effective date)
   - Payment type that gets better pricing
   - Company-specific patterns
   - The suggested due date should maintain the same day-offset pattern from the effective date

**Provide your response in this exact JSON format:**
{
  "daysBetweenEffectiveAndDue": <number>,
  "suggestedPaymentType": "regular" | "autopay" | "paid-in-full",
  "confidence": "high" | "medium" | "low",
  "reasoning": "Brief explanation of why this suggestion",
  "companyPattern": "Description of company's typical pattern",
  "pricingAdvantage": "Which payment type typically gets better pricing for this company"
}

IMPORTANT: Return the number of days between effective date and due date (daysBetweenEffectiveAndDue), NOT the actual date. This allows us to calculate a future date.

Respond ONLY with valid JSON, no additional text.`;

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert insurance payment analyst. Analyze patterns and provide accurate predictions in JSON format only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const aiResponse = completion.choices[0].message.content;
    if (!aiResponse) {
      throw new Error('No response from AI');
    }

    const aiSuggestion = JSON.parse(aiResponse);

    // ✅ CALCULATE FUTURE DUE DATE BASED ON PATTERN
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const effectiveDateObj = new Date(effectiveDate);
    const daysBetween = aiSuggestion.daysBetweenEffectiveAndDue || 15; // Default to 15 days if not provided

    // Calculate the suggested due date from the effective date
    let suggestedDueDate = new Date(effectiveDateObj);
    suggestedDueDate.setDate(suggestedDueDate.getDate() + daysBetween);

    // ✅ IF THE SUGGESTED DATE IS IN THE PAST, MOVE IT TO THE FUTURE
    if (suggestedDueDate < today) {
      console.log(`⚠️ Suggested date ${suggestedDueDate.toISOString().split('T')[0]} is in the past. Adjusting to future...`);
      
      // Calculate how many months have passed since the effective date
      const monthsPassed = Math.floor(
        (today.getTime() - effectiveDateObj.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
      );

      // Move the due date forward by the number of months passed + 1
      suggestedDueDate = new Date(effectiveDateObj);
      suggestedDueDate.setMonth(suggestedDueDate.getMonth() + monthsPassed + 1);
      suggestedDueDate.setDate(suggestedDueDate.getDate() + daysBetween);

      // If still in the past (edge case), set to today + daysBetween
      if (suggestedDueDate < today) {
        suggestedDueDate = new Date(today);
        suggestedDueDate.setDate(suggestedDueDate.getDate() + daysBetween);
      }

      console.log(`✅ Adjusted to future date: ${suggestedDueDate.toISOString().split('T')[0]}`);
    }

    // Calculate alternative due date (15 days from suggested)
    const alternativeDueDate = new Date(suggestedDueDate);
    alternativeDueDate.setDate(alternativeDueDate.getDate() + 15);

    // Format dates to YYYY-MM-DD
    const formatDate = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Build the final response
    const response = {
      suggestedDueDate: formatDate(suggestedDueDate),
      alternativeDueDate: formatDate(alternativeDueDate),
      suggestedPaymentType: aiSuggestion.suggestedPaymentType,
      confidence: aiSuggestion.confidence,
      reasoning: aiSuggestion.reasoning,
      companyPattern: aiSuggestion.companyPattern,
      pricingAdvantage: aiSuggestion.pricingAdvantage,
      dataPoints: {
        sameCompany: similarCustomers.length,
        otherCompanies: otherCompanyCustomers.length,
      },
      companyData: companyData.length > 0 ? companyData.slice(0, 3) : null,
    };

    console.log('✅ Final AI suggestion with future date:', response.suggestedDueDate);

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error getting AI suggestion:', error);
    return NextResponse.json(
      {
        error: 'Failed to get AI suggestion',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}