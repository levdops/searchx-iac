import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as elasticImpl from "./elasticsearch";
import * as mongoImpl from "./mongodb";
import * as frontendImpl from "./frontend";
import * as redisImpl from "./redis";

const cluster = new aws.ecs.Cluster("searchx-ecs-cluster");

// With ssl
const loadbalancer = new awsx.lb.ApplicationLoadBalancer("searchx-server-lb", {
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

// const httpListener = new aws.lb.Listener("http-listener", {
//     loadBalancerArn: loadbalancer.loadBalancer.arn,
//     port: 80,
//     protocol: "HTTP",
//     defaultActions: [{
//         type: "fixed-response",
//         fixedResponse: {
//             contentType: "text/plain",
//             statusCode: "404",
//         },
//     }],
// })
//
// const httpRedirect = new aws.lb.ListenerRule("httpRedirect", {
//     listenerArn: httpListener.arn,
//     conditions: [
//         {
//             pathPattern: {
//                 values: ["/*"], // Apply to all requests
//             },
//         },
//     ],
//     actions: [{
//         type: "redirect",
//         redirect: {
//             protocol: "HTTPS",
//             port: "443",
//             statusCode: "HTTP_301", // Permanent redirect
//         },
//     }],
//     priority: 200, // The rule priority, adjust as necessary
// });
// const backendVpc = new aws.ec2.Vpc("searchx-backend-vpc", {
//     cidrBlock: "10.0.0.0/24",
//     instanceTenancy: "default",
//     tags: {
//         Name: "main",
//     },
// });
//
// const privateSubnet = new aws.ec2.Subnet("searchx-backend-lb-subnet", {
//     vpcId: backendVpc.id,
//     cidrBlock: "10.0.0.0/24",
//     mapPublicIpOnLaunch: false,
// })


const serverService = new awsx.ecs.FargateService("searchx-server", {
    cluster: cluster.arn,
    assignPublicIp: true,
    // networkConfiguration: {
    //     assignPublicIp: false,
    //     subnets: [privateSubnet.id]
    // },
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

export const elasticPass = aws.secretsmanager.getSecretVersionOutput({secretId: elasticImpl.elasticSearchSecret.arn}).secretString;
export const bucketName = frontendImpl.frontendBucket.id;

export const cloudFrontDomain = frontendImpl.cdn.domainName;

export const serverEndpoint = loadbalancer.loadBalancer.dnsName;
