export {
  createSalesforceClient,
  describeSalesforceError,
  readSalesforceError,
  refreshSalesforceToken,
  revokeSalesforceToken,
  SALESFORCE_API_VERSION,
  SalesforceClient,
  type SalesforceSession,
  salesforceAccountMetadata,
  salesforceEnvironment,
  salesforceInstanceUrl,
  soqlString,
} from "./client";
export {
  SALESFORCE_LOGIN_HOSTS,
  type SalesforceEnvironment,
  salesforceIntegration,
} from "./config";
export {
  newLeadRecord,
  SALESFORCE_DEFAULT_LEAD_SOURCE,
  SALESFORCE_NO_COMPANY,
  SALESFORCE_TARGETS,
  type SalesforceSettings,
  salesforceLeads,
  syncResponsesToSalesforce,
} from "./sink";
