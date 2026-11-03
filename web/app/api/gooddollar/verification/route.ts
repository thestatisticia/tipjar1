import { NextRequest, NextResponse } from 'next/server';
import { isAddress } from 'viem';
import {
  GoodDollarVerificationUnavailableError,
  isGoodDollarVerifiedAddress,
} from '@/lib/goodDollarVerification';

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet');
  if (!wallet || !isAddress(wallet)) {
    return NextResponse.json({ error: 'A valid wallet address is required.' }, { status: 400 });
  }

  try {
    return NextResponse.json({
      verified: await isGoodDollarVerifiedAddress(wallet),
    });
  } catch (error) {
    if (error instanceof GoodDollarVerificationUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }
}
