import * as msRestNodeAuth from "@azure/ms-rest-nodeauth";
import { ContainerServiceClient } from "@azure/arm-containerservice";

export const getClusterVersion = async (
  cluster_name: string,
  resource_group_name: string,
  client_id: string,
  client_secret: string,
  tenant_id: string,
  subscription_id: string,
) => {
  console.log(`Checking Kubernetes version on cluster ${cluster_name} rg: ${resource_group_name}`)
  const auth_res = await msRestNodeAuth.loginWithServicePrincipalSecretWithAuthResponse(client_id, client_secret, tenant_id);
  const client = new ContainerServiceClient(auth_res.credentials, subscription_id);
  const result = await client.managedClusters.get(resource_group_name, cluster_name);
  return result.kubernetesVersion;
};