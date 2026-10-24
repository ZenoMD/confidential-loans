<pre>
  xls: XLS-00XX
  title: Confidential Lending Protocol
  description: Extends the lending protocol so that individual loans are funded, repaid and tracked using confidential MPT balances
  implementation: 
  author: Willem Olding <willemolding@gmail.com>, Lucian Stroie <luciandstroie@gmail.com>
  status: Draft
  category: Amendment
  requires: XLS-65, XLS-66, XLS-96
  created: 
  updated: 
  proposal-from:
</pre>

# Confidential Lending Protocol

## 1. Abstract

## 2. Motivation

## 3. Protocol Overview

The protocol for lenders works exactly as in XLS-66. Lenders contribute MPTs to a `SingleAssetVault` which is owned by a broker. The MPToken must support confidential transfers if it is to be used for confidential loans.

The broker withdraws funds from the vault with a `LoanBrokerDraw` transaction. This moves funds from the vault into the brokers confidential lending balance. The MPTs move into the lending balance confidential inbox and must be moved to the lending spendable balance by calling `LoanBrokerMergeInbox`. This lending balance is confidential and can be used to fund multiple loans without revealing how much is allocated to each loan. 

To issue a loan a broker and borrower agree to loan terms off-chain and co-sign a `LoanSet` transaction as in XLS-66. The difference being that the amount, amount owed, and periodic payment values are sent as ELGamal encrypted fields encrypted to the broker, borrower and auditor. A ZK proof ensures consistency between these encrypted values and applies the relevant range check. The homomorphic properties of ELGamal allow the ledger to debit the broker lending balance and credit the borrowers confidential inbox without revealing the amount publicly. Once the borrower has received their loan they can convert it to a spendable confidential balance and proceed to spend it confidentially as per XLS-96.

The borrower makes periodic confidential repayments via `ConfidentialLoanPay` transactions. This contains the repayment amount encrypted to the broker, borrower, and auditor. Because the ledger cannot read the encrypted payment amount directly it relies on some additional ZK proofs to ensure it meets the minimum repayment requirements for a periodic payment, or repays the balance of the loan if it is a repayment in full. 

## Amendments

This amendment (`ConfidentialLendingProtocol`) builds upon `LendingProtocolV1_1` and `ConfidentialTransfer`.

## 4. Ledger Entry: `LoanBroker`

The `LoanBroker` ledger entry is extended one flag. All other fields are as in XLS-66.

### 4.1. Flags

| Flag Name                   | Flag Value   | Modifiable? | Description                       |
| :-------------------------- | :----------- | :---------- | :-------------------------------- |
| `lsfLoanBrokerConfidential` | `0x00020000` | No          | The `LoanBroker` is confidential. |

### 4.2. Invariants

On a confidential `LoanBroker`:

- `ManagementFeeRate`, `CoverRateMinimum`, `CoverRateLiquidation` and `CoverAvailable` are always 0.
- `DebtTotal` is the amount the Lending Balance owes the Vault. It does not include interest.
- `DebtMaximum` limits `DebtTotal`, and is checked by `LoanBrokerDraw`.
- The pseudo-account's `MPToken` has `HolderEncryptionKey`, `ConfidentialBalanceSpending`, `ConfidentialBalanceInbox` and `IssuerEncryptedBalance`.

## 5. Ledger Entry: `Loan`

<!-- The `Loan` ledger entry is extended with following additional fields and one additional flag. All other fields are as in XLS-66.

### 5.1. Fields

| Field Name                         | Required? | JSON Type | Internal Type | Default Value | Description                                                                                                  |
| :--------------------------------- | :-------- | :-------- | :------------ | :------------ | :----------------------------------------------------------------------------------------------------------- |
| `BorrowerEncryptedAmountOwed`      | Conditional       | `string`  | `BLOB`        | N/A           | Amount Owed, encrypted under the Borrower's `HolderEncryptionKey`.                                           |
| `BrokerEncryptedAmountOwed`        | Conditional       | `string`  | `BLOB`        | N/A           | Amount Owed, encrypted under the Broker Key (the `HolderEncryptionKey` of the LoanBroker pseudo-account's `MPToken`). |
| `BorrowerEncryptedPeriodicPayment` | Conditional       | `string`  | `BLOB`        | N/A           | Periodic Payment, encrypted under the Borrower's `HolderEncryptionKey`.                                      |
| `BrokerEncryptedPeriodicPayment`   | Conditional       | `string`  | `BLOB`        | N/A           | Periodic Payment, encrypted under the Broker Key (the `HolderEncryptionKey` of the LoanBroker pseudo-account's `MPToken`). |
| `ConfidentialLoanVersion`          | Conditional       | `number`  | `UINT32`      | N/A           | Set to 0 when the `Loan` is created and incremented whenever an encrypted field changes. Bound into payment proofs so that they cannot be replayed. |

"Conditional" fields are present if and only if `lsfLoanConfidential` is set. Each encrypted field is a 66-byte XLS-96 ElGamal ciphertext.

### 5.2. Flags

| Flag Name             | Flag Value   | Modifiable? | Description                 |
| :-------------------- | :----------- | :---------- | :-------------------------- |
| `lsfLoanConfidential` | `0x00080000` | No          | The `Loan` is confidential. |

### 5.3. Existing Fields

On a confidential `Loan`:

- `TotalValueOutstanding`, `PrincipalOutstanding`, `ManagementFeeOutstanding`, `PeriodicPayment` and `LoanScale` are always 0.
- The fee fields (`LoanOriginationFee`, `LoanServiceFee`, `LatePaymentFee`, `ClosePaymentFee`, `OverpaymentFee`) and the interest-rate fields (`InterestRate`, `LateInterestRate`, `CloseInterestRate`, `OverpaymentInterestRate`) are always 0.
- `lsfLoanOverpayment` is never set.

### 5.4. Invariants

- If `lsfLoanConfidential` is set, all of the conditional fields are present, and the fields listed above as always 0 are 0.
- `lsfLoanConfidential` never changes.
- The XLS-66 invariant that a `Loan` with `PaymentRemaining` greater than 0 has a non-zero `TotalValueOutstanding`, `PrincipalOutstanding` or `ManagementFeeOutstanding` does not apply to a confidential `Loan`, whose amounts are held in the encrypted fields. -->

## 6. Transaction: `LoanBrokerSet`

Called by a LoanBroker to create or update their `LoanBroker` ledger entry. This extends the `LoanBrokerSet` transaction to support the creation of a confidential `LoanBroker`.

The confidential status of a `LoanBroker` must be set at creation time and cannot be modified after.

### 6.1. Fields

`HolderEncryptionKey` and `ZKProof` reuse the existing fields defined in XLS-96; no new fields are added.

| Field Name            | Required    | JSON Type | Internal Type | Default Value | Description                                                                                                         |
| :-------------------- | :---------- | :-------- | :------------ | :------------ | :------------------------------------------------------------------------------------------------------------------ |
| `HolderEncryptionKey` | Conditional | `string`  | `BLOB`        | N/A           | The Broker Key: a 33-byte compressed ElGamal public key, copied to the `HolderEncryptionKey` of the pseudo-account's `MPToken`. **Required** with `tfLoanBrokerConfidential`, otherwise not allowed. |
| `ZKProof`             | Conditional | `string`  | `BLOB`        | N/A           | A 64-byte XLS-96 Schnorr proof that the submitter knows the secret key for `HolderEncryptionKey`. **Required** with `tfLoanBrokerConfidential`, otherwise not allowed. |

The `ZKProof` is bound to the `LoanBrokerSet` context hash defined in [Appendix A.1](#a1-loanbrokerset-context-hash).

### 6.2. Flags

| Flag Name                  | Flag Value   | Description                                |
| :------------------------- | :----------- | :----------------------------------------- |
| `tfLoanBrokerConfidential` | `0x00020000` | Create the `LoanBroker` as confidential.   |

### 6.3. Transaction Fee

A confidential `LoanBrokerSet` costs 10 times the standard base fee (same as XLS-96 transactions), to accommodate the cost of verifying of its zero-knowledge proof.

### 6.4. Failure Conditions

In addition to the failure conditions listed in XLS-66:

1. `tfLoanBrokerConfidential` is set and `LoanBrokerID` is present. (`temINVALID`)
2. `tfLoanBrokerConfidential` is set and `HolderEncryptionKey` or `ZKProof` is missing, or either is present without the flag. (`temMALFORMED`)
3. `HolderEncryptionKey` is not a valid 33-byte compressed point, or `ZKProof` is not 64 bytes. (`temMALFORMED`)
4. `tfLoanBrokerConfidential` is set and `ManagementFeeRate`, `CoverRateMinimum` or `CoverRateLiquidation` is present and not 0. (`temINVALID`)
5. `tfLoanBrokerConfidential` is set and the Vault's asset is not an MPT, or its `MPTokenIssuance` does not have `lsfMPTCanHoldConfidentialBalance` and `lsfMPTCanTransfer` set or has no `IssuerEncryptionKey` or `AuditorEncryptionKey`. (`tecNO_PERMISSION`)
6. `tfLoanBrokerConfidential` is set and the Vault's `LEVersion` is not 1 (CashBasis). (`tecNO_PERMISSION`)
7. `ZKProof` does not prove knowledge of the secret key for `HolderEncryptionKey`. (`tecBAD_PROOF`)

### 6.5. State Changes

After the existing state changes listed in XLS-66:

1. Set `lsfLoanBrokerConfidential` on the created `LoanBroker`.
2. Set `HolderEncryptionKey` of the pseudo-account's `MPToken` to the transaction's `HolderEncryptionKey`.
3. Set `ConfidentialBalanceSpending` and `ConfidentialBalanceInbox` to the canonical encrypted zero under `HolderEncryptionKey`, `IssuerEncryptedBalance` under `IssuerEncryptionKey`, and `AuditorEncryptedBalance` under `AuditorEncryptionKey`, each computed for the pseudo-account.
4. Set `ConfidentialBalanceVersion` of that `MPToken` to 0.

## 7. Transaction (new): `LoanBrokerDraw`

Called by a LoanBroker to draw MPTs from a vault they own into the `LendingBalance`

### 7.1. Fields

| Field Name               | Required | JSON Type | Internal Type | Default Value | Description                                                                                    |
| :----------------------- | :------- | :-------- | :------------ | :------------ | :--------------------------------------------------------------------------------------------- |
| `TransactionType`        | Yes      | `string`  | `UINT16`      | TBD           | The transaction type.                                                                          |
| `Account`                | Yes      | `string`  | `ACCOUNTID`   | N/A           | The `LoanBroker.Owner`.                                                                        |
| `LoanBrokerID`           | Yes      | `string`  | `HASH256`     | N/A           | The confidential `LoanBroker`.                                                                 |
| `Amount`                 | Yes      | `object`  | `AMOUNT`      | N/A           | The amount to draw, in the Vault's asset.                                                      |
| `HolderEncryptedAmount`  | Yes      | `string`  | `BLOB`        | N/A           | `Amount` encrypted under the Broker Key. Credited to the Lending Balance inbox.               |
| `IssuerEncryptedAmount`  | Yes      | `string`  | `BLOB`        | N/A           | `Amount` encrypted under the Issuer's key.                                                     |
| `AuditorEncryptedAmount` | Yes      | `string`  | `BLOB`        | N/A           | `Amount` encrypted under the Auditor's key.                                                    |
| `BlindingFactor`         | Yes      | `string`  | `UINT256`     | N/A           | The randomness used to encrypt `Amount`, so validators can check the ciphertexts.              |

### 7.2. Failure Conditions

1. `Amount` is not a positive MPT amount. (`temBAD_AMOUNT`)
2. `LoanBrokerID` is zero. (`temINVALID`)
3. A ciphertext is malformed. (`temBAD_CIPHERTEXT`)
4. The `LoanBroker` does not exist. (`tecNO_ENTRY`)
5. The submitter is not `LoanBroker.Owner`, or the `LoanBroker` is not confidential. (`tecNO_PERMISSION`)
6. `Amount` is not in the Vault's asset. (`tecWRONG_ASSET`)
7. The Vault is not in its Investment phase. (`tecNO_PERMISSION`)
8. `Amount > Vault.AssetsAvailable`. (`tecINSUFFICIENT_FUNDS`)
9. `DebtMaximum` is not 0 and `DebtTotal + Amount > DebtMaximum`. (`tecLIMIT_EXCEEDED`)
10. The Vault pseudo-account or the `LoanBroker` pseudo-account is locked for the asset. (`tecLOCKED`)
11. The Vault pseudo-account or the `LoanBroker` pseudo-account is not authorized for the asset. (`tecNO_AUTH`)
12. The ciphertexts do not encrypt `Amount` with `BlindingFactor`. (`tecBAD_PROOF`)

### 7.3. State Changes

1. Decrease the Vault pseudo-account's `MPTAmount` and `Vault.AssetsAvailable` by `Amount`. `Vault.AssetsTotal` is unchanged.
2. Increase `LoanBroker.DebtTotal` by `Amount`.
3. Add `HolderEncryptedAmount` to the Lending Balance's `ConfidentialBalanceInbox`, `IssuerEncryptedAmount` to its `IssuerEncryptedBalance`, and `AuditorEncryptedAmount` to its `AuditorEncryptedBalance`.
4. Increase the issuance's `ConfidentialOutstandingAmount` by `Amount`.

### 7.4. Invariants

The Vault pseudo-account's `MPTAmount` and `Vault.AssetsAvailable` decrease by `Amount`, `ConfidentialOutstandingAmount` and `DebtTotal` increase by `Amount`, and `OutstandingAmount` and `Vault.AssetsTotal` are unchanged.

## 8. Transaction (new): `LoanBrokerSettle`

Called by a LoanBroker to return MPTs from their `LendingBalance` to the vault

## 9. Transaction (new): `LoanBrokerMergeInbox`

Called by a LoanBroker to merge their confidential lending balance inbox into the spending balance. This is the equivalent of `ConfidentialMPTMergeInbox` from XLS-96. 

### 9.1. Fields

| Field Name        | Required | JSON Type | Internal Type | Default Value | Description                    |
| :---------------- | :------- | :-------- | :------------ | :------------ | :----------------------------- |
| `TransactionType` | Yes      | `string`  | `UINT16`      | TBD           | The transaction type.          |
| `Account`         | Yes      | `string`  | `ACCOUNTID`   | N/A           | The `LoanBroker.Owner`.        |
| `LoanBrokerID`    | Yes      | `string`  | `HASH256`     | N/A           | The confidential `LoanBroker`. |

### 9.2. Failure Conditions

1. `LoanBrokerID` is zero. (`temINVALID`)
2. The `LoanBroker` does not exist. (`tecNO_ENTRY`)
3. The submitter is not `LoanBroker.Owner`, or the `LoanBroker` is not confidential. (`tecNO_PERMISSION`)
4. The `LoanBroker` pseudo-account's `MPToken` is locked, or the issuance is locked. (`tecLOCKED`)
5. The `LoanBroker` pseudo-account is not authorized for the asset. (`tecNO_AUTH`)

### 9.3. State Changes

As in XLS-96 `ConfidentialMPTMergeInbox`, on the `LoanBroker` pseudo-account's `MPToken`:

1. Add `ConfidentialBalanceInbox` to `ConfidentialBalanceSpending`.
2. Reset `ConfidentialBalanceInbox` to the canonical encrypted zero under `HolderEncryptionKey`, computed for the pseudo-account.
3. Increment `ConfidentialBalanceVersion`.

`IssuerEncryptedBalance` and `AuditorEncryptedBalance` are not changed. The merge succeeds, and still increments the version, if the inbox is already an encrypted zero.

### 9.4. Invariants

`ConfidentialOutstandingAmount`, `OutstandingAmount` and every `MPTAmount` are unchanged (same as `MergeInbox` from XLS-96)

## 10. Transaction: `LoanBrokerCoverDeposit`

### 10.1. Failure Conditions

In addition to XLS-66:

1. The `LoanBroker` is confidential. (`tecNO_PERMISSION`)

## 11. Transaction: `LoanSet`

<!-- Create a new `Loan` entry and transfer MPTs from the broker lending balance to the borrowers confidential balance

### 11.1. Fields

These fields are added. All other fields are as in XLS-66, except that `PrincipalRequested`, the fee fields and the interest-rate fields must be absent.

| Field Name                         | Required    | JSON Type | Internal Type | Default Value | Description                                                                                       |
| :--------------------------------- | :---------- | :-------- | :------------ | :------------ | :------------------------------------------------------------------------------------------------ |
| `BrokerEncryptedAmount`            | Conditional | `string`  | `BLOB`        | N/A           | The principal encrypted under the Broker Key. Subtracted from the Lending Balance.               |
| `BorrowerEncryptedAmount`          | Conditional | `string`  | `BLOB`        | N/A           | The principal encrypted under the Borrower's key. Credited to the Borrower's inbox.               |
| `IssuerEncryptedAmount`            | Conditional | `string`  | `BLOB`        | N/A           | The principal encrypted under the Issuer's key.                                                   |
| `AuditorEncryptedAmount`           | No          | `string`  | `BLOB`        | N/A           | The principal encrypted under the Auditor's key. **Required** if the issuance has an Auditor.     |
| `BalanceCommitment`                | Conditional | `string`  | `BLOB`        | N/A           | A commitment to the Lending Balance's spending balance.                                           |
| `AmountCommitment`                 | Conditional | `string`  | `BLOB`        | N/A           | A commitment to the principal.                                                                    |
| `BorrowerEncryptedAmountOwed`      | Conditional | `string`  | `BLOB`        | N/A           | The initial Amount Owed, under the Borrower's key.                                                |
| `BrokerEncryptedAmountOwed`        | Conditional | `string`  | `BLOB`        | N/A           | The initial Amount Owed, under the Broker Key.                                                   |
| `BorrowerEncryptedPeriodicPayment` | Conditional | `string`  | `BLOB`        | N/A           | The Periodic Payment, under the Borrower's key.                                                   |
| `BrokerEncryptedPeriodicPayment`   | Conditional | `string`  | `BLOB`        | N/A           | The Periodic Payment, under the Broker Key.                                                      |
| `ZKProof`                          | Conditional | `string`  | `BLOB`        | N/A           | The `LoanSet` proof (see below).                                                                  |

"Conditional" fields are **required** with `tfLoanConfidential`, and not allowed without it.

### 11.2. Flags

| Flag Name                  | Flag Value   | Description                                |
| :------------------------- | :----------- | :----------------------------------------- |
| `tfLoanConfidential` | `0x00020000` | Create the `Loan` as confidential.   |

### 11.3. State Changes -->

## 12. Transaction (new): `ConfidentialLoanPay`

Called by the Borrower to make a repayment on a confidential loan

## Appendix A: Context Hashes

### A.1. `LoanBrokerSet` Context Hash

Computed exactly as the XLS-96 `ConfidentialMPTConvert` context hash, but with the `LoanBrokerSet` transaction type:

```
SHA-512Half( TxType || Account || MPTokenIssuanceID || Sequence || Account || 0 )
```

| Component           | Encoding        | Value                                                        |
| :------------------ | :-------------- | :----------------------------------------------------------- |
| `TxType`            | `UINT16`, BE    | `ttLOAN_BROKER_SET` (74)                                     |
| `Account`           | 20 bytes        | The submitting account (the `LoanBroker` owner), written twice |
| `MPTokenIssuanceID` | 24 bytes        | The issuance ID of the Vault's asset                         |
| `Sequence`          | `UINT32`, BE    | The transaction's `Sequence`, or `TicketSequence` if a ticket is used |
| `0`                 | `UINT32`, BE    | Zero (unused version slot)                                   |
