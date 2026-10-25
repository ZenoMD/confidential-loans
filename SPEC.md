<pre>
  xls: XLS-00##
  title: Confidential Lending Protocol
  description: Extends the lending protocol so that individual loans are funded, repaid and tracked using confidential MPT balances
  implementation:
  author: Willem Olding <willemolding@gmail.com>, Lucian Stroie <luciandstroie@gmail.com>
  status: Draft
  category: Amendment
  requires: XLS-65, XLS-66, XLS-96
  created: 25-10-2026
  updated: 25-10-2026
  proposal-from:
</pre>

# Confidential Lending Protocol

## 1. Abstract

This specification describes how XRPL can be extended to support a new confidential lending protocol that protects borrowers from unwanted exposure. It combines features from the confidential MPTokens standard introduced in XLS-96 with the on-chain lending protocol in XLS-66.

The resulting protocol has the following properties:

- `SingleAssetVault` is used unmodified, and lenders can deposit non-confidential MPTs for lending
- Borrowers receive the loan in their confidential balance inbox and can proceed to spend it confidentially
- Loan terms (principal, amount owed, periodic payment amount) are encrypted on-chain using ElGamal encryption. Loan repayment consistency is enforced by the ledger with a combination of homomorphic addition and ZK proofs
- Loans can nominate an Auditor who can view all encrypted fields
- No additional cryptography is introduced beyond what is included in XLS-96

Confidential loans introduce some limitations compared with transparent loans (which may be addressed in the future). These are:

- No late fees or interest accrual, since interest cannot be applied with additive homomorphism
- No first-loss capital protection
- Additional liveness risk on the Broker as they must actively decrypt and send funds back to the vault

## 2. Motivation

In conventional banking it is very unusual for loans to be public information. One reason for this is that a public loan exposes the borrower to additional risk by revealing whether they are under financial stress or restricted in some way due to an outstanding loan. Other financial actors may exploit this information to force a borrower to pay a higher price for assets or risk a default.

Case study: A small business takes out an on-chain loan to buy inventory before its busy season. If the loan is public, suppliers can see the debt and tighten payment terms, and competitors get advance insight into the business's plans. Borrowing privately allows the business to receive the loan confidentially and prevents negative exposure.

Confidential loans on XRPL bring borrowers the level of confidentiality they expect from traditional banking while providing the benefits of a global ledger.

## 3. Protocol Overview

The protocol for lenders works exactly as in XLS-66. Lenders contribute MPTs to a `SingleAssetVault` which is owned by a broker. The MPToken must support confidential transfers if it is to be used for confidential loans.

The broker withdraws funds from the vault with a `LoanBrokerDraw` transaction. This moves funds from the vault into the broker's confidential lending balance. The MPTs arrive in the lending balance's confidential inbox and must be moved to its spendable balance by calling `LoanBrokerMergeInbox`. This lending balance is confidential and can be used to fund multiple loans without revealing how much is allocated to each loan. The broker cannot spend this balance except to fund a loan (via `LoanSet`) or repay the vault (via `LoanBrokerSettle`).

To issue a loan, a broker and borrower agree to loan terms off-chain and co-sign a `LoanSet` transaction as in XLS-66. The difference is that the loan term values (principal, amount owed and periodic payment) are sent as ElGamal ciphertexts encrypted to the broker, borrower and loan auditor. A ZK proof ensures consistency between these encrypted values and applies the relevant range checks. The homomorphic properties of ElGamal allow the ledger to debit the broker's lending balance and credit the borrower's confidential inbox without revealing the principal publicly. Once the borrower has received their loan, they can proceed to spend it confidentially as per XLS-96.

The borrower makes periodic confidential repayments via `ConfidentialLoanPay` transactions. Each contains the repayment amount encrypted to the broker, borrower, MPT Auditor and Loan Auditor. Because the ledger cannot read the encrypted payment amount directly, it relies on additional ZK proofs to ensure it meets the minimum periodic payment requirement, and to check whether the loan balance has been repaid in full.

A loan can be defaulted by the broker if a payment has not been made once `NextPaymentDueDate` + `GracePeriod` has passed (as in XLS-66).

At any time the broker can settle funds back to the vault with a `LoanBrokerSettle` transaction.

```
                  +-----------------------------+
                  |           Lenders           |
                  +-----------------------------+
                        |                 ^
          VaultDeposit  |                 |  VaultWithdraw
                        v                 |
                  +-----------------------------+
                  |  Vault (SingleAssetVault)   |
                  +-----------------------------+
                        |                 ^
        LoanBrokerDraw  |                 |  LoanBrokerSettle
       (amount public)  |                 |  (amount public)
                        |                 |
  PUBLIC  - - - - - - - | - - - - - - - - | - - - - - - - - - - - -
  CONFIDENTIAL          |                 |
                        v                 |
                  #=============================#
                  #   Broker Lending Balance    #
                  #                             #
                  #   inbox =========> spending #
                  #     LoanBrokerMergeInbox    #
                  #=============================#
                       /\                 ||
  ConfidentialLoanPay  ||                 ||  LoanSet
     (payment hidden)  ||                 ||  (principal hidden)
                       ||                 \/
                  #=============================#
                  #       Borrower Balance      #
                  #                             #
                  #  spending <========= inbox  #
                  #  ConfidentialMPTMergeInbox  #
                  #=============================#
                       ||
                       ||  ConfidentialMPTSend (XLS-96)
                       \/
                  other holders
```

## 4. Amendments

This amendment (`ConfidentialLendingProtocol`) builds upon `LendingProtocolV1_1` and `ConfidentialTransfer`.

## 5. Terminology

- **Broker Key**: The `HolderEncryptionKey` of the `LoanBroker` pseudo-account's `MPToken`, registered by `LoanBrokerSet`.
- **Lending Balance**: The confidential balance on the `MPToken` entry associated with the Broker Key.
- **MPT Auditor**: The holder of the issuance's `AuditorEncryptionKey` (XLS-96). Can read the Lending Balance and the amounts moved into and out of it.
- **Loan Auditor**: The holder of a `Loan`'s `LoanAuditorEncryptionKey`, agreed by the Broker and Borrower in `LoanSet`. Can read all of that `Loan`'s encrypted terms.

## 6. Ledger Entry: `LoanBroker`

The `LoanBroker` ledger entry is extended with one flag. All other fields are as in XLS-66.

### 6.1. Flags

| Flag Name                   | Flag Value   | Modifiable? | Description                       |
| :-------------------------- | :----------- | :---------- | :-------------------------------- |
| `lsfLoanBrokerConfidential` | `0x00020000` | No          | The `LoanBroker` is confidential. |

### 6.2. Invariants

On a confidential `LoanBroker`:

- `ManagementFeeRate`, `CoverRateMinimum`, `CoverRateLiquidation` and `CoverAvailable` are always 0.
- `DebtTotal` is the amount the Lending Balance owes the Vault. It does not include interest.
- `DebtMaximum` limits `DebtTotal`, and is checked by `LoanBrokerDraw`.
- The pseudo-account's `MPToken` has `HolderEncryptionKey`, `ConfidentialBalanceSpending`, `ConfidentialBalanceInbox` and `IssuerEncryptedBalance`.

## 7. Ledger Entry: `Loan`

A `Loan` created by a confidential `LoanBroker` is confidential. It gains the fields and flag below. All other fields are as in XLS-66.

### 7.1. Fields

Each hidden term is stored as three 66-byte XLS-96 ElGamal ciphertexts of the same value: under the Borrower's `HolderEncryptionKey`, the Broker Key, and `LoanAuditorEncryptionKey`.

| Term             | Fields                                                                                                      | Description                                         |
| :--------------- | :---------------------------------------------------------------------------------------------------------- | :-------------------------------------------------- |
| Principal        | `BorrowerEncryptedPrincipal`, `BrokerEncryptedPrincipal`, `LoanAuditorEncryptedPrincipal`                   | The amount lent.                                    |
| Amount Owed      | `BorrowerEncryptedAmountOwed`, `BrokerEncryptedAmountOwed`, `LoanAuditorEncryptedAmountOwed`                | The amount still to repay. Reduced by each payment. |
| Periodic Payment | `BorrowerEncryptedPeriodicPayment`, `BrokerEncryptedPeriodicPayment`, `LoanAuditorEncryptedPeriodicPayment` | The minimum regular payment.                        |

| Field Name                 | Required    | JSON Type | Internal Type | Default Value | Description                                                                                  |
| :------------------------- | :---------- | :-------- | :------------ | :------------ | :------------------------------------------------------------------------------------------- |
| `LoanAuditorEncryptionKey` | Conditional | `string`  | `BLOB`        | N/A           | The Loan Auditor's 33-byte compressed ElGamal public key.                                    |
| `ConfidentialLoanVersion`  | Conditional | `number`  | `UINT32`      | N/A           | Set to 0 at creation and incremented whenever an encrypted field changes. Bound into proofs. |

All of these fields (`BLOB` unless stated) are present if and only if `lsfLoanConfidential` is set.

### 7.2. Flags

| Flag Name             | Flag Value   | Modifiable? | Description                 |
| :-------------------- | :----------- | :---------- | :-------------------------- |
| `lsfLoanConfidential` | `0x00080000` | No          | The `Loan` is confidential. |

### 7.3. Invariants

On a confidential `Loan`:

- `PrincipalOutstanding`, `TotalValueOutstanding`, `ManagementFeeOutstanding`, `PeriodicPayment`, `LoanScale`, the fee fields and the interest-rate fields are 0.
- `lsfLoanOverpayment` is never set.
- Only the Amount Owed ciphertexts change after creation, and `ConfidentialLoanVersion` changes with them.
- The XLS-66 invariants that `PeriodicPayment` is positive and that a `Loan` with `PaymentRemaining` > 0 has a non-zero outstanding amount do not apply.

## 8. Transaction: `LoanBrokerSet`

Called by a LoanBroker to create or update their `LoanBroker` ledger entry. This extends the `LoanBrokerSet` transaction to support the creation of a confidential `LoanBroker`.

The confidential status of a `LoanBroker` must be set at creation time and cannot be modified afterwards.

### 8.1. Fields

`HolderEncryptionKey` and `ZKProof` reuse the existing fields defined in XLS-96; no new fields are added.

| Field Name            | Required    | JSON Type | Internal Type | Default Value | Description                                                                                                                                                                                          |
| :-------------------- | :---------- | :-------- | :------------ | :------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HolderEncryptionKey` | Conditional | `string`  | `BLOB`        | N/A           | The Broker Key: a 33-byte compressed ElGamal public key, copied to the `HolderEncryptionKey` of the pseudo-account's `MPToken`. **Required** with `tfLoanBrokerConfidential`, otherwise not allowed. |
| `ZKProof`             | Conditional | `string`  | `BLOB`        | N/A           | A 64-byte XLS-96 Schnorr proof that the submitter knows the secret key for `HolderEncryptionKey`. **Required** with `tfLoanBrokerConfidential`, otherwise not allowed.                               |

The `ZKProof` is bound to the `LoanBrokerSet` context hash defined in [Appendix A.1](#a1-loanbrokerset-context-hash).

### 8.2. Flags

| Flag Name                  | Flag Value   | Description                              |
| :------------------------- | :----------- | :--------------------------------------- |
| `tfLoanBrokerConfidential` | `0x00020000` | Create the `LoanBroker` as confidential. |

### 8.3. Transaction Fee

A confidential `LoanBrokerSet` costs 10 times the standard base fee, as for XLS-96 `ConfidentialMPTConvert`.

### 8.4. Failure Conditions

In addition to the failure conditions listed in XLS-66:

1. `tfLoanBrokerConfidential` is set and `LoanBrokerID` is present. (`temINVALID`)
2. `tfLoanBrokerConfidential` is set and `HolderEncryptionKey` or `ZKProof` is missing, or either is present without the flag. (`temMALFORMED`)
3. `HolderEncryptionKey` is not a valid 33-byte compressed point, or `ZKProof` is not 64 bytes. (`temMALFORMED`)
4. `tfLoanBrokerConfidential` is set and `ManagementFeeRate`, `CoverRateMinimum` or `CoverRateLiquidation` is present and not 0. (`temINVALID`)
5. `tfLoanBrokerConfidential` is set and the Vault's asset is not an MPT, or its `MPTokenIssuance` does not have `lsfMPTCanHoldConfidentialBalance` and `lsfMPTCanTransfer` set or has no `IssuerEncryptionKey` or `AuditorEncryptionKey`. (`tecNO_PERMISSION`)
6. `tfLoanBrokerConfidential` is set and the Vault's `LEVersion` is not 1 (CashBasis). (`tecNO_PERMISSION`)
7. `ZKProof` does not prove knowledge of the secret key for `HolderEncryptionKey`. (`tecBAD_PROOF`)

### 8.5. State Changes

After the existing state changes listed in XLS-66:

1. Set `lsfLoanBrokerConfidential` on the created `LoanBroker`.
2. Set `HolderEncryptionKey` of the pseudo-account's `MPToken` to the transaction's `HolderEncryptionKey`.
3. Set `ConfidentialBalanceSpending` and `ConfidentialBalanceInbox` to the canonical encrypted zero under `HolderEncryptionKey`, `IssuerEncryptedBalance` under `IssuerEncryptionKey`, and `AuditorEncryptedBalance` under `AuditorEncryptionKey`, each computed for the pseudo-account.
4. Set `ConfidentialBalanceVersion` of that `MPToken` to 0.

## 9. Transaction (new): `LoanBrokerDraw`

Called by a LoanBroker to draw MPTs from a vault they own into the Lending Balance.

### 9.1. Fields

| Field Name               | Required | JSON Type | Internal Type | Default Value | Description                                                                       |
| :----------------------- | :------- | :-------- | :------------ | :------------ | :-------------------------------------------------------------------------------- |
| `TransactionType`        | Yes      | `string`  | `UINT16`      | TBD           | The transaction type.                                                             |
| `Account`                | Yes      | `string`  | `ACCOUNTID`   | N/A           | The `LoanBroker.Owner`.                                                           |
| `LoanBrokerID`           | Yes      | `string`  | `HASH256`     | N/A           | The confidential `LoanBroker`.                                                    |
| `Amount`                 | Yes      | `object`  | `AMOUNT`      | N/A           | The amount to draw, in the Vault's asset.                                         |
| `HolderEncryptedAmount`  | Yes      | `string`  | `BLOB`        | N/A           | `Amount` encrypted under the Broker Key. Credited to the Lending Balance inbox.   |
| `IssuerEncryptedAmount`  | Yes      | `string`  | `BLOB`        | N/A           | `Amount` encrypted under the Issuer's key.                                        |
| `AuditorEncryptedAmount` | Yes      | `string`  | `BLOB`        | N/A           | `Amount` encrypted under the MPT Auditor's key.                                   |
| `BlindingFactor`         | Yes      | `string`  | `UINT256`     | N/A           | The randomness used to encrypt `Amount`, so validators can check the ciphertexts. |

### 9.2. Failure Conditions

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

### 9.3. State Changes

1. Decrease the Vault pseudo-account's `MPTAmount` and `Vault.AssetsAvailable` by `Amount`. `Vault.AssetsTotal` is unchanged.
2. Increase `LoanBroker.DebtTotal` by `Amount`.
3. Add `HolderEncryptedAmount` to the Lending Balance's `ConfidentialBalanceInbox`, `IssuerEncryptedAmount` to its `IssuerEncryptedBalance`, and `AuditorEncryptedAmount` to its `AuditorEncryptedBalance`.
4. Increase the issuance's `ConfidentialOutstandingAmount` by `Amount`.

### 9.4. Invariants

The Vault pseudo-account's `MPTAmount` and `Vault.AssetsAvailable` decrease by `Amount`, `ConfidentialOutstandingAmount` and `DebtTotal` increase by `Amount`, and `OutstandingAmount` and `Vault.AssetsTotal` are unchanged.

## 10. Transaction (new): `LoanBrokerSettle`

The LoanBroker returns funds from the Lending Balance to the Vault. The amount is public. It works like an XLS-96 `ConfidentialMPTConvertBack`, with the Vault pseudo-account's public balance as the destination. It first repays `DebtTotal`; any excess is yield to the Vault.

### 10.1. Fields

| Field Name               | Required | JSON Type | Internal Type | Default Value | Description                                                                                                                                                     |
| :----------------------- | :------- | :-------- | :------------ | :------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TransactionType`        | Yes      | `string`  | `UINT16`      | TBD           | The transaction type.                                                                                                                                           |
| `Account`                | Yes      | `string`  | `ACCOUNTID`   | N/A           | The `LoanBroker.Owner`.                                                                                                                                         |
| `LoanBrokerID`           | Yes      | `string`  | `HASH256`     | N/A           | The confidential `LoanBroker`.                                                                                                                                  |
| `Amount`                 | Yes      | `object`  | `AMOUNT`      | N/A           | The amount to settle, in the Vault's asset.                                                                                                                     |
| `HolderEncryptedAmount`  | Yes      | `string`  | `BLOB`        | N/A           | `Amount` under the Broker Key. Subtracted from the Lending Balance's spending balance.                                                                          |
| `IssuerEncryptedAmount`  | Yes      | `string`  | `BLOB`        | N/A           | `Amount` under the Issuer's key.                                                                                                                                |
| `AuditorEncryptedAmount` | Yes      | `string`  | `BLOB`        | N/A           | `Amount` under the MPT Auditor's key.                                                                                                                           |
| `BlindingFactor`         | Yes      | `string`  | `UINT256`     | N/A           | The randomness used to encrypt `Amount`, so validators can check the ciphertexts.                                                                               |
| `BalanceCommitment`      | Yes      | `string`  | `BLOB`        | N/A           | A commitment to the Lending Balance's spending balance.                                                                                                         |
| `ZKProof`                | Yes      | `string`  | `BLOB`        | N/A           | The 816-byte XLS-96 `ConfidentialMPTConvertBack` proof for the Lending Balance, bound to the context hash of [Appendix A.4](#a4-loanbrokersettle-context-hash). |

### 10.2. Transaction Fee

10 times the standard base fee, as for XLS-96 `ConfidentialMPTConvertBack`.

### 10.3. Failure Conditions

1. `Amount` is not a positive MPT amount. (`temBAD_AMOUNT`)
2. `LoanBrokerID` is zero. (`temINVALID`)
3. A ciphertext is malformed. (`temBAD_CIPHERTEXT`)
4. `BalanceCommitment` is not a valid 33-byte compressed point, or `ZKProof` is not 816 bytes. (`temMALFORMED`)
5. The `LoanBroker` does not exist. (`tecNO_ENTRY`)
6. The submitter is not `LoanBroker.Owner`, or the `LoanBroker` is not confidential. (`tecNO_PERMISSION`)
7. `Amount` is not in the Vault's asset. (`tecWRONG_ASSET`)
8. The Vault pseudo-account or the `LoanBroker` pseudo-account is locked for the asset. (`tecLOCKED`)
9. The Vault pseudo-account or the `LoanBroker` pseudo-account is not authorized for the asset. (`tecNO_AUTH`)
10. The ciphertexts do not encrypt `Amount` with `BlindingFactor`, or `ZKProof` does not verify against the Lending Balance's `ConfidentialBalanceSpending` and `ConfidentialBalanceVersion`. (`tecBAD_PROOF`)

### 10.4. State Changes

1. Subtract `HolderEncryptedAmount` from the Lending Balance's `ConfidentialBalanceSpending`, `IssuerEncryptedAmount` from its `IssuerEncryptedBalance` and `AuditorEncryptedAmount` from its `AuditorEncryptedBalance`, and increment its `ConfidentialBalanceVersion`.
2. Decrease the issuance's `ConfidentialOutstandingAmount` by `Amount`.
3. Increase the Vault pseudo-account's `MPTAmount` and `Vault.AssetsAvailable` by `Amount`.
4. Decrease `LoanBroker.DebtTotal` by min(`Amount`, `DebtTotal`), and increase `Vault.AssetsTotal` by the rest.

### 10.5. Invariants

The Vault pseudo-account's `MPTAmount` and `Vault.AssetsAvailable` increase by `Amount`, `ConfidentialOutstandingAmount` decreases by `Amount`, the decrease in `DebtTotal` plus the increase in `Vault.AssetsTotal` equals `Amount`, and `OutstandingAmount` is unchanged.

## 11. Transaction (new): `LoanBrokerMergeInbox`

Called by a LoanBroker to merge their confidential lending balance inbox into the spending balance. This is the equivalent of `ConfidentialMPTMergeInbox` from XLS-96.

### 11.1. Fields

| Field Name        | Required | JSON Type | Internal Type | Default Value | Description                    |
| :---------------- | :------- | :-------- | :------------ | :------------ | :----------------------------- |
| `TransactionType` | Yes      | `string`  | `UINT16`      | TBD           | The transaction type.          |
| `Account`         | Yes      | `string`  | `ACCOUNTID`   | N/A           | The `LoanBroker.Owner`.        |
| `LoanBrokerID`    | Yes      | `string`  | `HASH256`     | N/A           | The confidential `LoanBroker`. |

### 11.2. Failure Conditions

1. `LoanBrokerID` is zero. (`temINVALID`)
2. The `LoanBroker` does not exist. (`tecNO_ENTRY`)
3. The submitter is not `LoanBroker.Owner`, or the `LoanBroker` is not confidential. (`tecNO_PERMISSION`)
4. The `LoanBroker` pseudo-account is locked for the asset. (`tecLOCKED`)
5. The `LoanBroker` pseudo-account is not authorized for the asset. (`tecNO_AUTH`)

### 11.3. State Changes

As in XLS-96 `ConfidentialMPTMergeInbox`, on the `LoanBroker` pseudo-account's `MPToken`:

1. Add `ConfidentialBalanceInbox` to `ConfidentialBalanceSpending`.
2. Reset `ConfidentialBalanceInbox` to the canonical encrypted zero under `HolderEncryptionKey`, computed for the pseudo-account.
3. Increment `ConfidentialBalanceVersion`.

`IssuerEncryptedBalance` and `AuditorEncryptedBalance` are not changed. The merge succeeds, and still increments the version, if the inbox is already an encrypted zero.

### 11.4. Invariants

`ConfidentialOutstandingAmount`, `OutstandingAmount` and every `MPTAmount` are unchanged, as in XLS-96 `ConfidentialMPTMergeInbox`.

## 12. Transaction: `LoanBrokerCoverDeposit`

### 12.1. Failure Conditions

In addition to XLS-66:

1. The `LoanBroker` is confidential. (`tecNO_PERMISSION`)

## 13. Transaction: `LoanSet`

With a confidential `LoanBroker`, `LoanSet` creates a confidential `Loan`. As in XLS-66, the Broker and the Borrower both sign it. The principal moves from the Lending Balance to the Borrower's confidential inbox, as in an XLS-96 `ConfidentialMPTSend` from the `LoanBroker` pseudo-account to the Borrower.

### 13.1. Fields

With a confidential loan, `PrincipalRequested`, the fee fields and the interest-rate fields must be absent, and these fields are added:

| Field Name                            | Required    | JSON Type | Internal Type | Default Value | Description                                                                                                           |
| :------------------------------------ | :---------- | :-------- | :------------ | :------------ | :-------------------------------------------------------------------------------------------------------------------- |
| `SenderEncryptedAmount`               | Conditional | `string`  | `BLOB`        | N/A           | The principal under the Broker Key. Subtracted from the Lending Balance, and stored as `BrokerEncryptedPrincipal`.    |
| `DestinationEncryptedAmount`          | Conditional | `string`  | `BLOB`        | N/A           | The principal under the Borrower's key. Credited to the Borrower's inbox, and stored as `BorrowerEncryptedPrincipal`. |
| `IssuerEncryptedAmount`               | Conditional | `string`  | `BLOB`        | N/A           | The principal under the Issuer's key.                                                                                 |
| `AuditorEncryptedAmount`              | Conditional | `string`  | `BLOB`        | N/A           | The principal under the MPT Auditor's key.                                                                            |
| `BalanceCommitment`                   | Conditional | `string`  | `BLOB`        | N/A           | A commitment to the Lending Balance's spending balance.                                                               |
| `AmountCommitment`                    | Conditional | `string`  | `BLOB`        | N/A           | A commitment to the principal.                                                                                        |
| `ZKProof`                             | Conditional | `string`  | `BLOB`        | N/A           | The 3030-byte `LoanSet` proof (section 13.2).                                                                         |
| `LoanAuditorEncryptionKey`            | Conditional | `string`  | `BLOB`        | N/A           | The Loan Auditor's 33-byte compressed ElGamal public key.                                                             |
| `LoanAuditorEncryptedPrincipal`       | Conditional | `string`  | `BLOB`        | N/A           | The principal under the Loan Auditor's key.                                                                           |
| `BorrowerEncryptedAmountOwed`         | Conditional | `string`  | `BLOB`        | N/A           | The initial Amount Owed under the Borrower's key.                                                                     |
| `BrokerEncryptedAmountOwed`           | Conditional | `string`  | `BLOB`        | N/A           | The initial Amount Owed under the Broker Key.                                                                         |
| `LoanAuditorEncryptedAmountOwed`      | Conditional | `string`  | `BLOB`        | N/A           | The initial Amount Owed under the Loan Auditor's key.                                                                 |
| `BorrowerEncryptedPeriodicPayment`    | Conditional | `string`  | `BLOB`        | N/A           | The Periodic Payment under the Borrower's key.                                                                        |
| `BrokerEncryptedPeriodicPayment`      | Conditional | `string`  | `BLOB`        | N/A           | The Periodic Payment under the Broker Key.                                                                            |
| `LoanAuditorEncryptedPeriodicPayment` | Conditional | `string`  | `BLOB`        | N/A           | The Periodic Payment under the Loan Auditor's key.                                                                    |
| `AmountOwedCommitment`                | Conditional | `string`  | `BLOB`        | N/A           | A 33-byte commitment to the Amount Owed (section 13.2).                                                               |
| `PeriodicPaymentCommitment`           | Conditional | `string`  | `BLOB`        | N/A           | A 33-byte commitment to the Periodic Payment (section 13.2).                                                          |

"Conditional" fields are required with a confidential `LoanBroker` and not allowed otherwise.

### 13.2. Proofs

All ciphertexts of a term share one randomness r, different from every other term's, which is also the blinding factor of the term's commitment t*G + r*H, as in XLS-96 `ConfidentialMPTSend`. Let P, O and Q be the terms, PC_P be `AmountCommitment`, PC_O and PC_Q be the term commitments, and N be `PaymentTotal`. `ZKProof` concatenates these proofs, all bound to the context hash of [Appendix A.2](#a2-loanset-context-hash):

| Part |    Bytes | Proof                                                                      | Proves                                                       |
| :--- | -------: | :------------------------------------------------------------------------- | :----------------------------------------------------------- |
| 1    |      946 | XLS-96 `ConfidentialMPTSend` proof to the Borrower, Issuer and MPT Auditor | The principal transfer, as in XLS-96.                        |
| 2    |      192 | XLS-96 Send sigma proof to the Loan Auditor                                | `LoanAuditorEncryptedPrincipal` encrypts P.                  |
| 3-4  | 192 each | XLS-96 Send sigma proof to the Borrower, Broker Key and Loan Auditor       | The O and Q ciphertexts encrypt the values of PC_O and PC_Q. |
| 5    |      754 | Aggregated Bulletproof over PC_O and PC_Q                                  | O, Q >= 0.                                                   |
| 6    |      754 | Aggregated Bulletproof over PC_O - PC_P and N*PC_Q - PC_O                  | O >= P and N*Q >= O.                                         |

Recipients are in the order listed. Parts 2-4 prove ownership of the Lending Balance as part 1 does, so the Broker builds `ZKProof`.

### 13.3. Transaction Fee

As in XLS-66, plus 9 times the standard base fee, matching the 10 times base fee of XLS-96 `ConfidentialMPTSend`.

### 13.4. Failure Conditions

In addition to the XLS-66 conditions, except 6, 7, 9 and 13-20 of XLS-66 section 3.8.5.2 (the Vault, fee and interest checks), which do not apply with a confidential `LoanBroker`:

1. Some but not all of the section 13.1 fields are present, or they are present with `PrincipalRequested`, a fee field, an interest-rate field or `tfLoanOverpayment`. (`temMALFORMED`)
2. A ciphertext is malformed. (`temBAD_CIPHERTEXT`)
3. `LoanAuditorEncryptionKey` or a commitment is not a valid 33-byte compressed point, or `ZKProof` is not 3030 bytes. (`temMALFORMED`)
4. The ciphertexts of a term do not share their first 33 bytes, or two terms' ciphertexts do. (`temMALFORMED`)
5. The section 13.1 fields are present but the `LoanBroker` is not confidential, or absent but it is. (`tecNO_PERMISSION`)
6. The Borrower's `MPToken` has no `HolderEncryptionKey`, `ConfidentialBalanceInbox` or `IssuerEncryptedBalance`. (`tecNO_PERMISSION`)
7. The Borrower or the `LoanBroker` pseudo-account is locked for the asset. (`tecLOCKED`)
8. Part 1 of `ZKProof` does not verify against the Lending Balance's `ConfidentialBalanceSpending` and `ConfidentialBalanceVersion`. (`tecBAD_PROOF`)
9. Another part of `ZKProof` does not verify. (`tecBAD_PROOF`)

### 13.5. State Changes

With a confidential `LoanBroker`, XLS-66 state changes 3-6 (the holdings and the Vault transfer) and the `DebtTotal` increase in step 7 do not apply. Instead:

1. Move the principal as in XLS-96 `ConfidentialMPTSend`, from the `LoanBroker` pseudo-account to the Borrower. The Lending Balance's `ConfidentialBalanceSpending` and mirrors are debited and its `ConfidentialBalanceVersion` incremented. The Borrower's `ConfidentialBalanceInbox` and mirrors are credited with the re-randomized ciphertexts.
2. Create the `Loan` as in XLS-66 step 1, but with the section 7.3 fields set to 0, and with `lsfLoanConfidential`, `ConfidentialLoanVersion` 0 and the section 7.1 fields from the transaction. `BrokerEncryptedPrincipal` and `BorrowerEncryptedPrincipal` are `SenderEncryptedAmount` and `DestinationEncryptedAmount` as submitted, not re-randomized, so that they keep the principal's shared randomness.

### 13.6. Invariants

With a confidential `LoanBroker`, as for XLS-96 `ConfidentialMPTSend`: `ConfidentialOutstandingAmount`, `OutstandingAmount` and every `MPTAmount` are unchanged. The Vault and `DebtTotal` are also unchanged.

## 14. Transaction: `LoanPay`

### 14.1. Failure Conditions

In addition to XLS-66:

1. The `Loan` is confidential. (`tecNO_PERMISSION`)

## 15. Transaction (new): `ConfidentialLoanPay`

The Borrower pays a confidential `Loan` from their confidential spending balance into the Lending Balance's inbox, as an XLS-96 `ConfidentialMPTSend` from the Borrower to the `LoanBroker` pseudo-account. A regular payment is at least the Periodic Payment and at most the Amount Owed; a full payment (`tfLoanFullPayment`) is exactly the Amount Owed and closes the `Loan`. Payments are accepted until the `Loan` is closed or defaulted, with no late fees.

### 15.1. Fields

| Field Name                   | Required    | JSON Type | Internal Type | Default Value | Description                                                                                           |
| :--------------------------- | :---------- | :-------- | :------------ | :------------ | :---------------------------------------------------------------------------------------------------- |
| `TransactionType`            | Yes         | `string`  | `UINT16`      | TBD           | The transaction type.                                                                                 |
| `Account`                    | Yes         | `string`  | `ACCOUNTID`   | N/A           | The Borrower.                                                                                         |
| `LoanID`                     | Yes         | `string`  | `HASH256`     | N/A           | The confidential `Loan`.                                                                              |
| `SenderEncryptedAmount`      | Yes         | `string`  | `BLOB`        | N/A           | The payment under the Borrower's key.                                                                 |
| `DestinationEncryptedAmount` | Yes         | `string`  | `BLOB`        | N/A           | The payment under the Broker Key. Credited to the Lending Balance's inbox.                            |
| `IssuerEncryptedAmount`      | Yes         | `string`  | `BLOB`        | N/A           | The payment under the Issuer's key.                                                                   |
| `AuditorEncryptedAmount`     | Yes         | `string`  | `BLOB`        | N/A           | The payment under the MPT Auditor's key.                                                              |
| `LoanAuditorEncryptedAmount` | Yes         | `string`  | `BLOB`        | N/A           | The payment under the Loan Auditor's key.                                                             |
| `BalanceCommitment`          | Yes         | `string`  | `BLOB`        | N/A           | A commitment to the Borrower's spending balance.                                                      |
| `AmountCommitment`           | Yes         | `string`  | `BLOB`        | N/A           | A commitment to the payment.                                                                          |
| `AmountOwedCommitment`       | Conditional | `string`  | `BLOB`        | N/A           | A commitment to the Amount Owed. Required for a regular payment, not allowed for a full payment.      |
| `PeriodicPaymentCommitment`  | Conditional | `string`  | `BLOB`        | N/A           | A commitment to the Periodic Payment. Required for a regular payment, not allowed for a full payment. |
| `ZKProof`                    | Yes         | `string`  | `BLOB`        | N/A           | The 2148-byte (regular) or 1202-byte (full) payment proof (section 15.3).                             |

### 15.2. Flags

| Flag Name           | Flag Value   | Description                                     |
| :------------------ | :----------- | :---------------------------------------------- |
| `tfLoanFullPayment` | `0x00020000` | Pay the whole Amount Owed and close the `Loan`. |

### 15.3. Proofs

Let X be the payment. `ZKProof` concatenates these proofs, all bound to the context hash of [Appendix A.3](#a3-confidentialloanpay-context-hash):

| Part | Bytes | Payment | Proof                                                                                                                        | Proves                                                       |
| :--- | ----: | :------ | :--------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------- |
| 1    |   946 | Both    | XLS-96 `ConfidentialMPTSend` proof to the Broker Key, Issuer and MPT Auditor                                                 | The payment transfer, as in XLS-96.                          |
| 2    |   192 | Both    | XLS-96 Send sigma proof to the Loan Auditor                                                                                  | `LoanAuditorEncryptedAmount` encrypts X.                     |
| 3    |    64 | Full    | XLS-96 Clawback sigma proof, amount 0, Borrower's key, over `SenderEncryptedAmount` - `BorrowerEncryptedAmountOwed`          | X = Amount Owed.                                             |
| 3    |   128 | Regular | XLS-96 ConvertBack sigma proof, Borrower's key, over `BorrowerEncryptedAmountOwed` and `AmountOwedCommitment`                | `AmountOwedCommitment` commits to the Amount Owed.           |
| 4    |   128 | Regular | As part 3, over `BorrowerEncryptedPeriodicPayment` and `PeriodicPaymentCommitment`                                           | `PeriodicPaymentCommitment` commits to the Periodic Payment. |
| 5    |   754 | Regular | Aggregated Bulletproof over `AmountCommitment` - `PeriodicPaymentCommitment` and `AmountOwedCommitment` - `AmountCommitment` | Periodic Payment <= X <= Amount Owed.                        |

### 15.4. Transaction Fee

10 times the standard base fee, as for XLS-96 `ConfidentialMPTSend`.

### 15.5. Failure Conditions

1. `LoanID` is zero. (`temINVALID`)
2. A ciphertext is malformed. (`temBAD_CIPHERTEXT`)
3. A commitment is not a valid 33-byte compressed point, `AmountOwedCommitment` or `PeriodicPaymentCommitment` is present for a full payment or missing for a regular one, or `ZKProof` has the wrong length. (`temMALFORMED`)
4. The payment ciphertexts do not share their first 33 bytes. (`temMALFORMED`)
5. The `Loan` does not exist. (`tecNO_ENTRY`)
6. The submitter is not the Borrower, or the `Loan` is not confidential. (`tecNO_PERMISSION`)
7. `PaymentRemaining` is 0, or it is 1 and the payment is regular. (`tecKILLED`)
8. The Borrower or the `LoanBroker` pseudo-account is locked for the asset. (`tecLOCKED`)
9. The Borrower or the `LoanBroker` pseudo-account is not authorized for the asset. (`tecNO_AUTH`)
10. Part 1 of `ZKProof` does not verify against the Borrower's `ConfidentialBalanceSpending` and `ConfidentialBalanceVersion`. (`tecBAD_PROOF`)
11. Another part of `ZKProof` does not verify. (`tecBAD_PROOF`)

### 15.6. State Changes

1. Move the payment as in XLS-96 `ConfidentialMPTSend`, from the Borrower to the `LoanBroker` pseudo-account.
2. Regular payment: subtract `SenderEncryptedAmount`, `DestinationEncryptedAmount` (as submitted) and `LoanAuditorEncryptedAmount` from the Borrower, Broker and Loan Auditor Amount Owed ciphertexts, increment `ConfidentialLoanVersion`, decrement `PaymentRemaining`, set `PreviousPaymentDueDate` to `NextPaymentDueDate`, and increase `NextPaymentDueDate` by `PaymentInterval`.
3. Full payment: set `PaymentRemaining` and `NextPaymentDueDate` to 0.

### 15.7. Invariants

As for XLS-96 `ConfidentialMPTSend`: `ConfidentialOutstandingAmount`, `OutstandingAmount` and every `MPTAmount` are unchanged. The Vault and `DebtTotal` are also unchanged.

## 16. Transaction: `LoanDelete`

### 16.1. State Changes

With a confidential `LoanBroker`, XLS-66 state change 5 (clearing `DebtTotal` when the last `Loan` is deleted) does not apply.

## Appendix A: Context Hashes

### A.1. `LoanBrokerSet` Context Hash

Computed as the XLS-96 `ConfidentialMPTConvert` context hash, but with `ttLOAN_BROKER_SET` and the `LoanBroker` owner as `Account`:

```
SHA-512Half( TxType || Account || MPTokenIssuanceID || Sequence || Account || 0 )
```

### A.2. `LoanSet` Context Hash

Computed as the XLS-96 `ConfidentialMPTSend` context hash, but with `ttLOAN_SET`, the `LoanBroker` pseudo-account as `Account`, the Borrower as `Destination`, and the Lending Balance's `ConfidentialBalanceVersion` as `Version`:

```
SHA-512Half( TxType || Account || MPTokenIssuanceID || Sequence || Destination || Version )
```

### A.3. `ConfidentialLoanPay` Context Hash

```
SHA-512Half( TxType || Account || MPTokenIssuanceID || Sequence || Destination || Version || LoanID || ConfidentialLoanVersion )
```

As A.2, with `ttCONFIDENTIAL_LOAN_PAY`, the Borrower as `Account`, the `LoanBroker` pseudo-account as `Destination`, the Borrower's `ConfidentialBalanceVersion` as `Version`, and the `Loan`'s `LoanID` (32 bytes) and `ConfidentialLoanVersion` (`UINT32`, BE) appended.

### A.4. `LoanBrokerSettle` Context Hash

Computed as the XLS-96 `ConfidentialMPTConvertBack` context hash, but with `ttLOAN_BROKER_SETTLE`, the `LoanBroker` pseudo-account as `Account`, and the Lending Balance's `ConfidentialBalanceVersion` as `Version`:

```
SHA-512Half( TxType || Account || MPTokenIssuanceID || Sequence || Account || Version )
```
