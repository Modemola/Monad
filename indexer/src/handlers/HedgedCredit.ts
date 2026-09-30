import { indexer } from "envio";

import { account, day, protocol } from "../lib/store.js";

indexer.onEvent({ contract: "HedgedCredit", event: "LoanOpened" }, async ({ event, context }) => {
  const {
    loanId,
    borrower,
    seriesId,
    offtakeHours,
    basisRatioBps,
    hedgeSize,
    hedgeEntryPrice,
    principal,
    interest,
    margin,
    maturity,
  } = event.params;

  // Borrowers get an Account row even if they never trade directly, so `loans` resolves.
  const a = await account(context, borrower);
  context.Account.set(a);

  context.Loan.set({
    id: loanId.toString(),
    loanId,
    borrower_id: borrower,
    series_id: seriesId.toString(),
    status: "Open",
    offtakeHours,
    basisRatioBps: Number(basisRatioBps),
    hedgeSize,
    hedgeEntryPrice,
    principal,
    interest,
    margin,
    maturity,
    openedAt: BigInt(event.block.timestamp),
    openTxHash: event.transaction.hash,
    hedgePnl: undefined,
    netOwed: undefined,
    marginReturned: undefined,
    shortfall: undefined,
    keeper: undefined,
    resolvedAt: undefined,
  });

  const p = await protocol(context);
  const updated = {
    ...p,
    loansOpened: p.loansOpened + 1,
    loansOpen: p.loansOpen + 1,
    principalOutstanding: p.principalOutstanding + principal,
    principalLent: p.principalLent + principal,
  };
  context.Protocol.set(updated);

  const d = await day(context, event.block.timestamp, updated);
  context.DailySnapshot.set({
    ...d,
    loansOpened: d.loansOpened + 1,
    principalLent: d.principalLent + principal,
  });
});

indexer.onEvent({ contract: "HedgedCredit", event: "LoanClosed" }, async ({ event, context }) => {
  const { loanId, hedgePnl, netOwed, marginReturned } = event.params;

  const loan = await context.Loan.getOrThrow(loanId.toString());
  context.Loan.set({
    ...loan,
    status: "Closed",
    hedgePnl,
    netOwed,
    marginReturned,
    resolvedAt: BigInt(event.block.timestamp),
  });

  const p = await protocol(context);
  context.Protocol.set({
    ...p,
    loansOpen: p.loansOpen - 1,
    principalOutstanding: p.principalOutstanding - loan.principal,
    hedgePnlRealized: p.hedgePnlRealized + hedgePnl,
  });
});

indexer.onEvent({ contract: "HedgedCredit", event: "LoanSeized" }, async ({ event, context }) => {
  const { loanId, keeper, shortfall } = event.params;

  const loan = await context.Loan.getOrThrow(loanId.toString());
  context.Loan.set({
    ...loan,
    status: "Seized",
    shortfall,
    keeper,
    resolvedAt: BigInt(event.block.timestamp),
  });

  const p = await protocol(context);
  context.Protocol.set({
    ...p,
    loansOpen: p.loansOpen - 1,
    principalOutstanding: p.principalOutstanding - loan.principal,
  });
});
