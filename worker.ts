import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import * as mongoImpl from "./mongodb";
import * as aws from "@pulumi/aws";
import { cluster } from "./fargateCluster";
import * as redisImpl from "./redis";

export const workerService = new awsx.ecs.FargateService("searchx-worker", {
    cluster: cluster.arn,
    assignPublicIp: true,
    taskDefinitionArgs: {
        container: {
            name: "searchx-worker",
            image: "ghcr.io/levdops/worker:latest",
            cpu: 128,
            memory: 512,
            essential: true,
            environment: [
                { name: "NODE_ENV", value: "production" },
                {
                    name: "DB",
                    value: pulumi.interpolate`mongodb://${mongoImpl.mongoClusterImpl.masterUsername}:${aws.secretsmanager.getSecretVersionOutput({secretId: mongoImpl.mongoDBSecret.arn}).secretString}@${mongoImpl.mongoClusterImpl.endpoint}:27017/searchx-pilot-app-1`,
                },
                {
                    name: "REDIS",
                    value: pulumi.interpolate`redis://${redisImpl.redis.cacheNodes[0].address}:6379`,
                },
            ],
        },
    },
    desiredCount: 1,
});