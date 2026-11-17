// Vitest setup (vitest.config.ts): every test file runs with a valid licence
// key, as qrdx.dev does, signed by this run's throwaway key pair, which the
// licence check is told to trust (tests and development only). Tests that
// need another key stub QRDX_EE_LICENSE with one from ./ee-license.ts.
import { trustLicensePublicKeyForTests } from "@repo/auth/license";
import { testLicence, testLicencePublicKey } from "./ee-license";

trustLicensePublicKeyForTests(testLicencePublicKey());
process.env.QRDX_EE_LICENSE = testLicence();
