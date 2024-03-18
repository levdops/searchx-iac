import * as random from "@pulumi/random";
import * as aws from "@pulumi/aws";

const elasticPassword = new random.RandomPassword("searchx-elasticsearch-password", {
    length: 16,
    minLower: 1,
    minUpper: 1,
    minNumeric: 1,
    minSpecial: 1,
    overrideSpecial: '!*'
});
const elasticSecret = new aws.secretsmanager.Secret("aws-elastic-password", {
    namePrefix: "searchx-elastic-password",
})
const elasticSecretVersion = new aws.secretsmanager.SecretVersion("aws-elastic-password-v1", {
    secretId: elasticSecret.id,
    secretString: elasticPassword.result,
})
const elasticsearch = new aws.opensearch.Domain("searchx-elasticsearch", {
    domainName: "searchx-elasticsearch",
    clusterConfig: {
        instanceType: "t3.small.search",
    },
    engineVersion: "Elasticsearch_7.10",
    ebsOptions: {
        ebsEnabled: true,
        volumeSize: 10,
    },
    encryptAtRest: {
        enabled: true,
    },
    domainEndpointOptions: {
        enforceHttps: true,
        tlsSecurityPolicy: 'Policy-Min-TLS-1-0-2019-07'
    },
    advancedSecurityOptions: {
        enabled: true,
        internalUserDatabaseEnabled: true,
        masterUserOptions: {
            masterUserName: "elasticSearchXUser",
            masterUserPassword: elasticPassword.result
        }
    },
    nodeToNodeEncryption: {
        enabled: true,
    },
    // TODO: replace IP with the current machine pulumi is running on
    accessPolicies: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Effect: "Allow",
            Action: "es:*",
            Principal: {
                AWS: "*"
            },
            Resource: "arn:aws:es:eu-central-1:767397730875:domain/searchx-elasticsearch/*",
        }]
    }),
});

export const elasticSearchSecret = elasticSecret
export const elasticSearchEndpoint = elasticsearch.endpoint