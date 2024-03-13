import * as aws from "@pulumi/aws";

export const frontendBucket = new aws.s3.Bucket("searchx-frontend", {
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

export const certificate = aws.acm.Certificate.get(
    "searchx-certificate",
    // TODO: make this a variable
    "arn:aws:acm:eu-central-1:767397730875:certificate/173730c4-db25-4005-b164-6cb0cf7648a6"
);

export const cdn = new aws.cloudfront.Distribution("cdn", {
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
                originSslProtocols: ["TLSv1.2"],
            },
        },
    ],
    aliases: ["searchx.geisink.com"],

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
        acmCertificateArn:
            "arn:aws:acm:us-east-1:767397730875:certificate/7837223a-390e-4d97-bd9b-793c50f496cc", // Per AWS, ACM certificate must be in the us-east-1 region.
        //cloudfrontDefaultCertificate: true,
        sslSupportMethod: "sni-only",
    },

    // loggingConfig: {
    //     bucket: logsBucket.bucketDomainName,
    //     includeCookies: false,
    //     prefix: `${config.targetDomain}/`,
    // },
});