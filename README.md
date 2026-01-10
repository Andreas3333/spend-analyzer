# spend-analyzer

A simple tool for analyzing spending by categorizing transaction data.

## Deployment quickstart

<details>
<summary>Prerequisites</summary>

Required:

- An AWS Account
- Valid AWS credential configured and a profile set in your current shell, for example: `export AWS_PROFILE=<my-profile>`
- AWS API Gateway CloudWatch log role configured in the AWS Account
- An AWS Rout53 Hosted Zone
- AWS SAM cli installed
- Docker installed and running
- uv installed
- The project cloned locally

Optional:

- Request Increase AWS Account Lambda Function memory allocation increase to max 10240MB
    Not required but this will reduce inference times by ~20 seconds for 200 row and ~50 seconds for 500 row datasets.

---
</details>
</p>

- Create a venv

`alias uv-venv='uv venv; source .venv/bin/activate'; uv-venv`

First deployment requires writing the samconfig.toml and saving your configuration. Once you have a samconfig.toml you
can utilize the spend-analyzer makefile.

- Build the app:

`cd spend-analyzer && sam build --use-container`

- Go through a guided dry-run to configure an initial samconfig.toml:

`sam deploy --save-params --guided --no-execute-changeset` 

Complete the prompts and set values for the HostedZoneId, DomainName, and ApiDomainName template parameters.

Once the CloudFormation ChangeSet is competed you can remove the `guided` and 
`no_execute_changeset` keys from the [<your-env>.deploy.parameters] section of your samconfig.toml

- Use the make targets to deploy the app instance:

`make deploy`
