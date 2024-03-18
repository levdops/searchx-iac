import { cluster } from "./fargateCluster";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import * as mongoImpl from "./mongodb";
import * as aws from "@pulumi/aws";
import * as redisImpl from "./redis";
import * as elasticImpl from "./elasticsearch";
import * as frontendImpl from "./frontend";
// With ssl
export const loadbalancer = new awsx.lb.ApplicationLoadBalancer("searchx-server-lb", {
    listeners: [
        {
            port: 80,
            protocol: "HTTP",
        },
        {
            port: 443,
            protocol: "HTTPS",
            certificateArn: frontendImpl.certificate.arn,
        },
    ],
});

const serverService = new awsx.ecs.FargateService("searchx-server", {
    cluster: cluster.arn,
    assignPublicIp: true,
    taskDefinitionArgs: {
        container: {
            name: "searchx-server",
            image: "ghcr.io/levdops/server:latest",
            cpu: 128,
            memory: 512,
            essential: true,
            portMappings: [
                {
                    containerPort: 80,
                    targetGroup: loadbalancer.defaultTargetGroup,
                },
            ],
            environment: [
                { name: "NODE_ENV", value: "production" },
                { name: "PORT", value: "80" },
                { name: "SUGGESTIONS_TYPE", value: "none" },
                { name: "DEFAULT_SEARCH_PROVIDER", value: "elasticsearch" },
                { name: "ES_INDEX", value: "trec_car" },
                {
                    name: "DB",
                    value: pulumi.interpolate`mongodb://${mongoImpl.mongoClusterImpl.masterUsername}:${aws.secretsmanager.getSecretVersionOutput({secretId: mongoImpl.mongoDBSecret.arn}).secretString}@${mongoImpl.mongoClusterImpl.endpoint}:27017/searchx-pilot-app-1`,
                },
                {
                    name: "REDIS",
                    value: pulumi.interpolate`redis://${redisImpl.redis.cacheNodes[0].address}:6379`,
                },
                {
                    name: "ELASTIC_SEARCH",
                    value: pulumi.interpolate`https://elasticSearchXUser:${aws.secretsmanager.getSecretVersionOutput({secretId: elasticImpl.elasticSearchSecret.arn}).secretString}@${elasticImpl.elasticSearchEndpoint}`,
                },
            ],
        },
    },
    desiredCount: 1,
});