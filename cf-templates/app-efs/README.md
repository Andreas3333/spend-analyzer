# EFS template

`efs-template.yaml` creates an EFS instance in a private subnet that can be used as a 
"model registry" for an application.

## Deployment

Set values in a `parameters.json` file and run `aws cloudformation deploy --stack-name ml-efs --template efs-template.yaml --parameter-overrides file://parameters.json` from the app-efs directory.

