import * as aws from "@pulumi/aws";

export const redis = new aws.elasticache.Cluster("searchx-redis", {
    engine: "redis",
    engineVersion: "7.1",
    nodeType: "cache.t3.micro", // In aws free tier
    numCacheNodes: 1,
});