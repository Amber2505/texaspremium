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
const companyData = similarCustomers
      .filter((customer) => customer.dueDate && customer.effectiveDate)
      .map((customer) => {
        const effDate = new Date(customer.effectiveDate);
        const dueDate = new Date(customer.dueDate);

        // Skip if dates are invalid
        if (isNaN(effDate.getTime()) || isNaN(dueDate.getTime())) return null;

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
      })
      .filter(Boolean);

    const otherCompanyData = otherCompanyCustomers
      .filter((customer) => customer.dueDate && customer.effectiveDate)
      .map((customer) => {
        const effDate = new Date(customer.effectiveDate);
        const dueDate = new Date(customer.dueDate);

        if (isNaN(effDate.getTime()) || isNaN(dueDate.getTime())) return null;

        const daysDiff = Math.floor(
          (dueDate.getTime() - effDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        return {
          company: customer.companyName,
          paymentType: customer.paymentType,
          daysBetween: daysDiff,
        };
      })
      .filter(Boolean);

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

    console.log('🤖 Raw AI response:', aiResponse);
    let aiSuggestion;
    try {
      aiSuggestion = JSON.parse(aiResponse);
      console.log('✅ Parsed AI suggestion:', aiSuggestion);
    } catch (parseErr) {
      console.error('❌ Failed to parse AI response:', parseErr);
      throw new Error('AI returned invalid JSON');
    }

    // Extract the day-of-month from the AI's pattern
    // e.g. if effective date is Jan 8 and daysBetween = 25, payment day = Jan 8 + 25 = Feb 2 → day 2
    const effectiveDateObj = new Date(effectiveDate);
    const daysBetween = aiSuggestion.daysBetweenEffectiveAndDue || 15;
    const patternDate = new Date(effectiveDateObj);
    patternDate.setDate(patternDate.getDate() + daysBetween);
    const paymentDayOfMonth = patternDate.getDate(); // e.g. 5, 21, 28

    // Always suggest NEXT month's occurrence — never this month, never today, never past
    // Rule: if due date is May 5 and today is May 3 → suggest June 5
    //       if due date is May 2 and today is May 3 → suggest June 2
    //       if due date is today → suggest next month
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Try this month first — if payment day hasn't passed yet, use it
    const daysInThisMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const clampedDayThisMonth = Math.min(paymentDayOfMonth, daysInThisMonth);
    const thisMonthCandidate = new Date(today.getFullYear(), today.getMonth(), clampedDayThisMonth);

    let suggestedDueDate: Date;
    if (thisMonthCandidate > today) {
      // May 5 and today is May 3 → suggest May 5
      suggestedDueDate = thisMonthCandidate;
    } else {
      // May 2 and today is May 3 → suggest June 2
      const daysInNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0).getDate();
      const clampedDayNextMonth = Math.min(paymentDayOfMonth, daysInNextMonth);
      suggestedDueDate = new Date(today.getFullYear(), today.getMonth() + 1, clampedDayNextMonth);
    }

    console.log(`✅ Payment day pattern: ${paymentDayOfMonth} → Next due: ${suggestedDueDate.toISOString().split('T')[0]}`);

    // Alternative = month after that
    const alternativeDueDate = new Date(suggestedDueDate);
    alternativeDueDate.setMonth(alternativeDueDate.getMonth() + 1);

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