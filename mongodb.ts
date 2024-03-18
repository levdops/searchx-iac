import * as aws from "@pulumi/aws";
import * as random from "@pulumi/random";

const mongoPassword = new random.RandomPassword("searchx-mongodb-password", {
    length: 16,
    special: false,
});
const mongoSecret = new aws.secretsmanager.Secret("aws-mongodb-password", {
    namePrefix: "searchx-mongodb-password",
})
const mongoSecretVersion = new aws.secretsmanager.SecretVersion("aws-mongodb-password-v1", {
    secretId: mongoSecret.id,
    secretString: mongoPassword.result,
})

const mongoParameterGroup = new aws.docdb.ClusterParameterGroup(
    "searchx-mongo-parameter-group",
    {
        family: "docdb5.0",
        parameters: [
            {
                name: "tls",
                value: "disabled",
            },
        ],
    }
);

const mongoCluster = new aws.docdb.Cluster("searchx-mongo-cluster", {
    backupRetentionPeriod: 5,
    clusterIdentifier: "searchx-mongo-cluster",
    engine: "docdb",
    masterPassword: mongoPassword.result,
    masterUsername: "searchx",
    skipFinalSnapshot: true,
    dbClusterParameterGroupName: mongoParameterGroup.name,
});

const mongo = new aws.docdb.ClusterInstance("searchx-mongo-instance", {
    clusterIdentifier: mongoCluster.id,
    instanceClass: "db.t3.medium",
    identifier: "searchx-mongo-instance",
});

export const mongoClusterImpl = mongoCluster
export const mongoDBSecret = mongoSecret

