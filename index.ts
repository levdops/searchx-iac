import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as random from "@pulumi/random";

// FRONTEND

const frontendBucket = new aws.s3.Bucket("searchx-frontend", {
    bucket: "searchx-frontend",
    website: {
        indexDocument: "index.html",
    },
});

const bucketOwnershipControls = new aws.s3.BucketOwnershipControls(
    "ownership-controls",
    {
        bucket: frontendBucket.id,
        rule: {
            objectOwnership: "ObjectWriter",
        },
    }
);

const publicAccessBlock = new aws.s3.BucketPublicAccessBlock(
    "public-access-block",
    {
        bucket: frontendBucket.id,
    }
);

const certificate = aws.acm.Certificate.get(
    "searchx-certificate",
    // TODO: make this a variable
    "arn:aws:acm:eu-central-1:767397730875:certificate/173730c4-db25-4005-b164-6cb0cf7648a6"
);

const cdn = new aws.cloudfront.Distribution("cdn", {
    enabled: true,
    // Alternate aliases the CloudFront distribution can be reached at, in addition to https://xxxx.cloudfront.net.
    // Required if you want to access the distribution via config.targetDomain as well.
    // aliases: distributionAliases,

    // We only specify one origin for this distribution, the S3 content bucket.
    origins: [
        {
            originId: frontendBucket.arn,
            domainName: frontendBucket.websiteEndpoint,
            customOriginConfig: {
                originProtocolPolicy: "http-only",
                httpPort: 80,
                httpsPort: 443,
                originSslProtocols: ['TLSv1.2']
            }
        },
    ],
    aliases: [
        "searchx.geisink.com"
    ],

    defaultRootObject: "index.html",

    // A CloudFront distribution can configure different cache behaviors based on the request path.
    // Here we just specify a single, default cache behavior which is just read-only requests to S3.
    defaultCacheBehavior: {
        targetOriginId: frontendBucket.arn,

        viewerProtocolPolicy: "redirect-to-https",
        allowedMethods: ["GET", "HEAD", "OPTIONS"],
        cachedMethods: ["GET", "HEAD", "OPTIONS"],

        forwardedValues: {
            cookies: { forward: "none" },
            queryString: false,
        },

        minTtl: 0,
        defaultTtl: 60 * 10,
        maxTtl: 60 * 10,
    },

    // "All" is the most broad distribution, and also the most expensive.
    // "100" is the least broad, and also the least expensive.
    priceClass: "PriceClass_100",

    // You can customize error responses. When CloudFront receives an error from the origin (e.g. S3 or some other
    // web service) it can return a different error code, and return the response for a different resource.
    // customErrorResponses: [
    //     { errorCode: 404, responseCode: 404, responsePagePath: "/404.html" },
    // ],

    restrictions: {
        geoRestriction: {
            restrictionType: "none",
        },
    },

    viewerCertificate: {
        acmCertificateArn: "arn:aws:acm:us-east-1:767397730875:certificate/7837223a-390e-4d97-bd9b-793c50f496cc",  // Per AWS, ACM certificate must be in the us-east-1 region.
        //cloudfrontDefaultCertificate: true,
        sslSupportMethod: "sni-only",
    },

    // loggingConfig: {
    //     bucket: logsBucket.bucketDomainName,
    //     includeCookies: false,
    //     prefix: `${config.targetDomain}/`,
    // },
});

// BACKEND

const redis = new aws.elasticache.Cluster("searchx-redis", {
    engine: "redis",
    engineVersion: "7.1",
    nodeType: "cache.t3.micro", // In aws free tier
    numCacheNodes: 1,
});

const mongoPassword = new random.RandomPassword("searchx-mongodb-password", {
    length: 16,
    special: false,
});

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
    // TODO: replace IP with the current machine pulumi is running on
    accessPolicies: `{
                      "Version": "2012-10-17",
                      "Statement": [
                        {
                          "Effect": "Allow",
                          "Principal": {
                            "AWS": "*"
                          },
                          "Action": "es:*",
                          "Resource": "arn:aws:es:eu-central-1:767397730875:domain/searchx-elasticsearch/*",
                          "Condition": {
                            "IpAddress": {
                              "aws:SourceIp": "145.3.17.70" 
                            }
                          }
                        }
                      ]
                    }`
});

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
            certificateArn: certificate.arn,
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
                    value: pulumi.interpolate`mongodb://${mongoCluster.masterUsername}:${mongoCluster.masterPassword}@${mongoCluster.endpoint}:27017/searchx-pilot-app-1`,
                },
                {
                    name: "REDIS",
                    value: pulumi.interpolate`redis://${redis.cacheNodes[0].address}:6379`,
                },
                {
                    name: "ELASTIC_SEARCH",
                    value: pulumi.interpolate`https://${elasticsearch.endpoint}`,
                },
            ],
        },
    },
    desiredCount: 1,
});

service.
export const bucketName = frontendBucket.id;

export const cloudFrontDomain = cdn.domainName;

export const serverEndpoint = loadbalancer.loadBalancer.dnsName;
