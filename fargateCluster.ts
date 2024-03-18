import * as aws from "@pulumi/aws";

export const cluster = new aws.ecs.Cluster("searchx-ecs-cluster");