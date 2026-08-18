// Stand-in for a real payment provider call. No network request, no real
// money — this project never touches a live Stripe account. Swapping this
// for a real `stripe.refunds.create(...)` call is the only change needed
// to go from demo to production, and it happens after human approval only.
export async function mockIssueRefund(amount: number) {
  return {
    mockChargeId: `mock_re_${Math.random().toString(36).slice(2, 12)}`,
    amount,
    status: "succeeded" as const,
  };
}
