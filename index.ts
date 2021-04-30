import { getClusterVersion } from "./azure";
import { getFileFromRepo, createCommit } from "./octokit";
const HCL = require('js-hcl-parser');
const YAML = require("js-yaml");
const { bootstrap } = require('global-agent');
bootstrap();

const azure_login: any = {
  dev: {
    client_id: process.env.NONPROD_ARM_CLIENT_ID,
    client_secret: process.env.NONPROD_ARM_CLIENT_SECRET,
    tenant_id: process.env.NONPROD_ARM_TENANT_ID,
    subscription_id: process.env.NONPROD_ARM_SUBSCRIPTION_ID,
  },
  stage: {
    client_id: process.env.PROD_ARM_CLIENT_ID,
    client_secret: process.env.PROD_ARM_CLIENT_SECRET,
    tenant_id: process.env.PROD_ARM_TENANT_ID,
    subscription_id: process.env.PROD_ARM_SUBSCRIPTION_ID,
  },
  prod: {
    client_id: process.env.PROD_ARM_CLIENT_ID,
    client_secret: process.env.PROD_ARM_CLIENT_SECRET,
    tenant_id: process.env.PROD_ARM_TENANT_ID,
    subscription_id: process.env.PROD_ARM_SUBSCRIPTION_ID,
  },
};

(async () => {
  try {
    // Pulling Galaxies
    const universe_repos = YAML.load(await getFileFromRepo('kps-universe', 'krogertechnology', '.github/workflows/sync.yml', null)).env.REPOSITORIES;
    const repositories = [...universe_repos.match(/krogertechnology\/(kps-galaxy-.*)/g)];

    for (const repository of repositories) {
      const owner: string = repository.split('/')[0];
      const repo: string = repository.split('/')[1];

      for (const env of ['dev', 'stage', 'prod']) {
        for (const region of ['centralus', 'eastus2']) {
          try {
            // Pulling current cluster's kubernetes version
            const subnet_tfvars = JSON.parse(HCL.parse(await getFileFromRepo(repo, owner, `environments/${env}-${region}/01-subnet/terraform.auto.tfvars`, `automation-${env}-${region}`)));
            let current_cluster_version = '1.19.7';
            try {
              current_cluster_version = await getClusterVersion(
                `${subnet_tfvars['team_name']}-cluster-${env}-aks`,
                subnet_tfvars['resource_group_name'],
                azure_login[env].client_id,
                azure_login[env].client_secret,
                azure_login[env].tenant_id,
                azure_login[env].subscription_id,
              );
            } catch (e) {
              if (e.statusCode === 404) {
                console.log(`${subnet_tfvars['team_name']}-cluster-${env}-aks was not found in resource group ${subnet_tfvars['resource_group_name']}`);
              }
            }

            // Getting tfvars from Github
            const aks_tfvars = JSON.parse(HCL.parse(await getFileFromRepo(repo, owner, `environments/${env}-${region}/02-aks-cluster/terraform.auto.tfvars`, `automation-${env}-${region}`)));
            // Check if kubernetes_version is specified in file
            if (aks_tfvars['kubernetes_version']) {
              console.log(`${repo}/environments/${env}-${region}/02-aks-cluster/terraform.auto.tfvars already has a kubernetes_version specified`);
              // Validation that the version in tfvars matches with azure.
              if (aks_tfvars['kubernetes_version'] != current_cluster_version) {
                console.log(`${repo}/environments/${env}-${region}/02-aks-cluster/terraform.auto.tfvars has a different version than the cluster!`);
                console.log(`${aks_tfvars['kubernetes_version']} != ${current_cluster_version}`);
              } else {
                console.log(`${repo}/environments/${env}-${region}/02-aks-cluster/terraform.auto.tfvars OK`);
                console.log(`${aks_tfvars['kubernetes_version']} == ${current_cluster_version}`);
              }
            } else {
              // If no kubernetes_version is specified. Put the one pulled from azure.
              console.log(`${repo}/environments/${env}-${region}/02-aks-cluster/terraform.auto.tfvars doesn't have kubernetes_version. Setting it...`);
              const new_tfvars = HCL.stringify(JSON.stringify({
                ...aks_tfvars,
                kubernetes_version: current_cluster_version,
              })).replace(/\"(\w+)\"\s=\s/g, '$1 = ');
              const files = {};
              files[`environments/${env}-${region}/02-aks-cluster/terraform.auto.tfvars`] = new_tfvars;
              await createCommit(repo, owner, `automation-${env}-${region}`, {
                files,
                commit: 'Adding kubernetes_version'
              });
            }

          } catch (err) {
            if (err.status === 404) {
              console.log(`tfvars file not found in ${repo} branch: automation-${env}-${region}. Skipping`);
            } else {
              throw err;
            }
          }
          console.log('\n');
        }
      }
      console.log('\n\n\n\n');
    }
  } catch (error) {
    console.error(error);
  }
})();