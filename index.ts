import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as random from "@pulumi/random";

// FRONTEND

const frontendBucket = new aws.s3.Bucket("searchx-frontend", {
    website: {
        indexDocument: "index.html",
    },
});

const publicAccessBlock = new aws.s3.BucketPublicAccessBlock(
    "public-access-block",
    {
        bucket: frontendBucket.id,
    }
);

const originAccessIdentity = new aws.cloudfront.OriginAccessIdentity(
    "originAccessIdentity",
    {
        comment: "this is needed to setup s3 polices and make s3 not public.",
    }
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
            domainName: frontendBucket.bucketRegionalDomainName,
            s3OriginConfig: {
                originAccessIdentity:
                    originAccessIdentity.cloudfrontAccessIdentityPath,
            },
        },
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
        // acmCertificateArn: certificateArn,  // Per AWS, ACM certificate must be in the us-east-1 region.
        cloudfrontDefaultCertificate: true,
        // sslSupportMethod: "sni-only",
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
});

const mongo = new aws.docdb.Cluster("searchx-mongo", {
    backupRetentionPeriod: 5,
    clusterIdentifier: "searchx-mongo-cluster",
    engine: "docdb",
    masterPassword: mongoPassword.result,
    masterUsername: "searchx",
    skipFinalSnapshot: true,
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
});

export const bucketName = frontendBucket.id;

export const cloudFrontDomain = cdn.domainName;

export const redisEndpoint = redis.cacheNodes[0].address;

export const mongoEndpoint = mongo.endpoint;

export const elasticsearchEndpoint = elasticsearch.endpoint;
