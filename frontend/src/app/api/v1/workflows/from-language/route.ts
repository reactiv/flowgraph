import { NextRequest, NextResponse } from 'next/server';

// Increase timeout for this long-running LLM request
export const maxDuration = 300; // 5 minutes

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

    const response = await fetch('http://backend:8000/api/v1/workflows/from-language', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();

    // Transform snake_case to camelCase for frontend compatibility
    const transformed = {
      definition: data.definition,
      validation: {
        isValid: data.validation.is_valid,
        errors: data.validation.errors,
        warnings: data.validation.warnings,
        fixesApplied: data.validation.fixes_applied,
      },
    };

    return NextResponse.json(transformed);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { detail: 'Request timed out. The schema generation is taking too long.' },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
