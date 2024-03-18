import * as aws from "@pulumi/aws";
import * as elasticImpl from "./elasticsearch";
import * as frontendImpl from "./frontend";
import * as backendImpl from "./backend";
import * as workerImpl from "./worker";


export const elasticPass = aws.secretsmanager.getSecretVersionOutput({secretId: elasticImpl.elasticSearchSecret.arn}).secretString;
export const bucketName = frontendImpl.frontendBucket.id;

export const cloudFrontDomain = frontendImpl.cdn.domainName;

export const serverEndpoint = backendImpl.loadbalancer.loadBalancer.dnsName;

export const workerLogGroup = workerImpl.workerService.service.name
