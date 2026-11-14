# QRdx Commercial License

Copyright (c) 2026 Ritesh Bucha and QRdx contributors

Version 2.0, November 2026

This license sets the terms for the code in the `ee/` directories of the QRdx repository. You can read, change and test that code without asking. Running it for real users or real data needs a written agreement with QRdx. The rest of the repository is under other licenses: see section 7 and [LICENSING.md](../../../LICENSING.md).

## 1. Definitions

- **"QRdx"**, **"we"** and **"us"** mean Ritesh Bucha, an individual based in India who operates QRdx, and any successor or assignee, including any company that operates QRdx now or later.
- **"You"** means the person or organisation that uses the Commercial Software. If you use it for an organisation, you accept this license for that organisation and confirm you're allowed to.
- **"Commercial Software"** means everything in each `ee/` directory of the QRdx repository that contains this license (today `apps/app/ee` and `packages/auth/ee`), in every version QRdx publishes there, and any changed version or part of it. Third-party components in those directories keep their own licenses.
- **"Production Use"** means running the Commercial Software for real users or real data, or for any purpose other than developing, testing and evaluating it. It includes a self-hosted QRdx server where the Commercial Software is switched on with a License Key.
- **"Agreement"** means a written agreement between you and QRdx, such as an enterprise agreement or an order form, that allows Production Use and refers to this license.
- **"License Key"** means a key QRdx issues to you with an Agreement. You set it in the `QRDX_EE_LICENSE` environment variable, and it switches the Commercial Software on.

Using single sign-on or the audit log on qrdx.dev is covered by the [Terms of Service](https://qrdx.dev/legal/terms-of-service), not by this license.

## 2. Production Use needs an Agreement

You may make Production Use of the Commercial Software only under an Agreement.

Under an Agreement, QRdx gives you a non-exclusive, non-transferable license, with no right to sublicense, to use and change the Commercial Software in Production Use, for the term and within the scope the Agreement sets (for example the servers, users or features it covers). That license ends when the Agreement ends.

If an Agreement and this license differ, the Agreement applies.

## 3. What you may do without an Agreement

You may:

- read the source code;
- copy, change and run it to develop, test and evaluate it, on systems that aren't in Production Use. On those systems you may also change the License Key check, so you can test the features;
- share copies of the source, changed or not, as long as this license goes with them. Sharing a copy gives no one the right to Production Use.

## 4. License Keys

- A License Key belongs to the Agreement it was issued with. Use it only for what that Agreement covers, keep it confidential and don't share it.
- Each License Key has an expiry date. After it, you may no longer use that key, and the Commercial Software switches its features off once any grace period the software allows has run out. A renewed or new Agreement comes with a new key.
- A key is a technical control. The Agreement, not the key, gives you the right to Production Use: a key that switches the features on gives you no rights the Agreement doesn't.

## 5. Your changes and contributions

- You own the changes you make to the Commercial Software. They're based on QRdx's code, so you may use them only as this license allows, and in Production Use only under an Agreement.
- If you submit a change to QRdx, for example in a pull request, the [QRdx Contributor License Agreement](../../../CLA.md) applies to it: you keep the copyright and give QRdx the licenses the CLA describes. If the CLA doesn't cover a change you submit, you give QRdx a perpetual, worldwide, non-exclusive, royalty-free, irrevocable license to use, copy, change, distribute, sublicense and relicense that change, under this license or any other.
- QRdx keeps every right in the Commercial Software that this license or an Agreement doesn't expressly give you.

## 6. What you may not do

Except as section 3 allows on systems that aren't in Production Use, or as an Agreement says, you may not:

- make Production Use of the Commercial Software without an Agreement;
- sell, rent, lease, sublicense or otherwise commercialize it;
- offer it, or a service built on it, to others;
- remove, disable, bypass or work around the License Key check that switches it on;
- forge or alter a License Key, or use one that QRdx didn't issue to you;
- remove or change this license or its copyright notice.

## 7. The rest of the repository

This license covers only the Commercial Software. The rest of the QRdx repository is under its own licenses, listed in [LICENSING.md](../../../LICENSING.md): the GNU Affero General Public License, version 3 or (at your option) any later version (AGPL-3.0-or-later), and the MIT license. Nothing in this license limits the rights those licenses give you in code outside the `ee/` directories.

## 8. Trademarks

This license gives you no right to use the QRdx name, logo or the qrdx.dev domain. The [trademark policy](../../../TRADEMARK.md) says how you may use them.

## 9. No warranty

To the extent the law allows, the Commercial Software is provided "as is", without warranty of any kind, express or implied, including merchantability, fitness for a particular purpose and non-infringement. An Agreement may give warranties; this license doesn't.

## 10. Limitation of liability

To the extent the law allows:

- QRdx isn't liable for indirect, incidental, special, consequential or punitive damages, or for lost profits, revenue, data or business opportunities, arising from the Commercial Software or this license;
- QRdx's total liability for all claims about the Commercial Software is limited to the fees you paid QRdx under the Agreement in the 12 months before the claim arose. Without an Agreement, QRdx has no liability to you under this license.

These limits don't apply to liability that the law doesn't allow to be limited, such as liability for fraud. An Agreement may set different limits.

## 11. Ending

- If you break this license, your rights under it end automatically. QRdx may restore them in writing.
- When an Agreement ends, your right to Production Use under it ends too. Stop Production Use and remove the License Key. The rest of QRdx keeps working without the Commercial Software.
- Sections 1, 5, 9, 10, 11, 12 and 13 still apply after this license or an Agreement ends.

## 12. Governing law and disputes

This license is governed by the laws of India, without regard to conflict-of-law rules.

1. **Talk to us first.** Email [enterprise@qrdx.dev](mailto:enterprise@qrdx.dev) and we'll try to settle the dispute in good faith within 30 days.
2. **Arbitration.** If that fails, the dispute is settled by binding arbitration under the Arbitration and Conciliation Act, 1996, by a sole arbitrator, seated in Bengaluru, India, in English.
3. **Courts.** Matters that can't go to arbitration, and urgent requests for interim relief, go to the courts of Bengaluru, India.

An Agreement may set a different law or forum.

## 13. General

- **Assignment.** You may not transfer this license, an Agreement or a License Key without QRdx's written consent. QRdx may transfer them to a successor, for example a company that takes over QRdx.
- **Export.** You're responsible for following the export control and sanctions laws that apply to your use of the Commercial Software.
- **New versions.** QRdx may publish new versions of this license. Each version applies to the Commercial Software published with it. Code you received under an earlier version stays under that version, unless your Agreement says otherwise.
- **Severability.** If part of this license can't be enforced, the rest still applies.
- **No waiver.** Not enforcing a right straight away doesn't mean QRdx gives it up.
- **Whole agreement.** This license, with any Agreement, is the whole agreement about the Commercial Software.

## 14. Contact

To ask for an Agreement or a License Key, use the [enterprise page](https://qrdx.dev/enterprise) or email [enterprise@qrdx.dev](mailto:enterprise@qrdx.dev). Notices about this license go to the same address.
