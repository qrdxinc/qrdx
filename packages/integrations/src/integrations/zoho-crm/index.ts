export {
  createZohoCrmClient,
  revokeZohoToken,
  ZOHO_CRM_BATCH_SIZE,
  ZOHO_REVOKE_PATH,
  ZohoCrmClient,
  type ZohoLeadFields,
  type ZohoUpsertResult,
} from "./client";
export { ZOHO_CRM_SCOPES, zohoCrmIntegration } from "./config";
export {
  ZOHO_DATA_CENTRES,
  ZOHO_DEFAULT_ACCOUNTS,
  type ZohoDataCentre,
  zohoDataCentreByAccounts,
  zohoDataCentreByApi,
} from "./data-centres";
export {
  upsertResponsesToZohoCrm,
  withFallbackLastName,
  ZOHO_CRM_TARGETS,
  ZOHO_LEAD_FIELD_LENGTHS,
  zohoLeads,
} from "./sink";
