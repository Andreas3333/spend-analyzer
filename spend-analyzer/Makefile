
.PHONY: help
help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'


.PHONY: deploy build-frontend deploy-sam sync-to-s3 invalidate-cloudfront


deploy: download-model build-sam deploy-sam write-amplify-config write-api-url build-frontend sync-to-s3 invalidate-cloudfront ## Deploy the spend-analyzer app
push-frontend: write-amplify-config write-api-url build-frontend sync-to-s3 invalidate-cloudfront ## Build and push frontend package to S3 Bucket

# Downloads the classifier model weights to a local directory for lambda package
download-model:
	@echo "Downloading model files..."
	mkdir -p classify_transactions/model
	uv pip install huggingface_hub
	uv run python -c 'from huggingface_hub import snapshot_download; snapshot_download(repo_id="aschaler/bert-bank-transaction-classification", local_dir="./classify_transactions/model/", ignore_patterns=["*.csv","*.png","*.md",".git"], local_dir_use_symlinks=False)'
	rm -r classify_transactions/model/.cache classify_transactions/model/.gitattributes
	uv pip uninstall huggingface_hub

build-sam:
	@echo "Building SAM..."
	sam build --use-container

deploy-sam:
	@echo "Deploying SAM..."
	sam deploy $(SAM_ARGS)

# Write amplifyconfiguration for frontend app build
write-amplify-config:
	@echo "Writing values to amplifyconfiguration.json..."
	$(eval AWS_REGION := $(shell aws configure get region 2>/dev/null || echo us-east-1))
	$(eval COGNITO_USER_POOL_ID := $(shell aws cloudformation describe-stacks --stack-name spend-analyzer --query "Stacks[0].Outputs[?OutputKey=='SpendAnalyzerUserPoolId'].OutputValue" --output text))
	@if [ -z "$(COGNITO_USER_POOL_ID)" ] || [ "$(COGNITO_USER_POOL_ID)" = "None" ]; then echo "ERROR: UserPoolId not found" && exit 1; fi
	
	$(eval COGNITO_USER_POOL_CLIENT_ID := $(shell aws cloudformation describe-stacks --stack-name spend-analyzer --query "Stacks[0].Outputs[?OutputKey=='SpendAnalyzerUserPoolClientId'].OutputValue" --output text))
	@if [ -z "$(COGNITO_USER_POOL_CLIENT_ID)" ] || [ "$(COGNITO_USER_POOL_CLIENT_ID)" = "None" ]; then echo "ERROR: UserPoolClientId not found" && exit 1; fi

	$(eval S3_USER_DATA_BUCKET_NAME := $(shell aws cloudformation describe-stacks --stack-name spend-analyzer --query "Stacks[0].Outputs[?OutputKey=='UserDataBucketName'].OutputValue" --output text))
	@if [ -z "$(COGNITO_USER_POOL_CLIENT_ID)" ] || [ "$(COGNITO_USER_POOL_CLIENT_ID)" = "None" ]; then echo "ERROR: UserPoolClientId not found" && exit 1; fi
	@echo "Generating frontend/src/amplifyconfiguration.json..."
	@printf '{\n\
		"aws_project_region": "$(AWS_REGION)",\n\
		"aws_cognito_region": "$(AWS_REGION)",\n\
		"aws_user_pools_id": "$(COGNITO_USER_POOL_ID)",\n\
		"aws_user_pools_web_client_id": "$(COGNITO_USER_POOL_CLIENT_ID)",\n\
		"oauth": {},\n\
		"aws_cognito_username_attributes": ["EMAIL"],\n\
		"aws_cognito_social_providers": [],\n\
		"aws_cognito_signup_attributes": ["EMAIL"],\n\
		"aws_cognito_mfa_configuration": "OFF",\n\
		"aws_cognito_password_protection_settings": {\n\
			"passwordPolicyMinLength": 8,\n\
			"passwordPolicyCharacters": []\n\
		},\n\
		"aws_cognito_verification_mechanisms": ["EMAIL"]\n\
	}\n' > frontend/src/amplifyconfiguration.json

# Write API URL for frontend app build
write-api-url:
	@echo "Writing deployed API base URL to frontend/.env..."
	# Query the CloudFormation stack outputs for the API base URL
	$(eval API_BASE := $(shell aws cloudformation describe-stacks --stack-name spend-analyzer --query "Stacks[0].Outputs[?OutputKey=='SpendAnalyzerApiBase'].OutputValue" --output text 2>/dev/null || true))
	@if [ -z "$(API_BASE)" ] || [ "$(API_BASE)" = "None" ]; then \
		echo "ERROR: SpendAnalyzerApiBase output not found in stack outputs. Run 'aws cloudformation describe-stacks --stack-name spend-analyzer --query \"Stacks[0].Outputs\' to inspect outputs." && exit 1; \
	else \
		echo "VITE_API_BASE=$(API_BASE)" > frontend/.env; \
	fi

build-frontend:
	@echo "Building frontend..."
	cd frontend && if [ -f package-lock.json ]; then npm ci; else npm install; fi && npm run build

sync-to-s3:
	@echo "Syncing frontend build to S3..."
	$(eval BUCKET := $(shell aws cloudformation describe-stacks --stack-name spend-analyzer --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" --output text))
	@if [ -z "$(BUCKET)" ] || [ "$(BUCKET)" = "None" ]; then echo "ERROR: FrontendBucketName not found in stack outputs" && exit 1; fi
	aws s3 sync frontend/dist/ s3://$(BUCKET) --delete

invalidate-cloudfront:
	@echo "Invalidating CloudFront distribution (if exists)..."
	$(eval FRONTEND_URL := $(shell aws cloudformation describe-stacks --stack-name spend-analyzer --query "Stacks[0].Outputs[?OutputKey=='FrontendUrl'].OutputValue" --output text | tr -d '\n\r'))
	@DOMAIN=$$(echo "$(FRONTEND_URL)" | sed -e 's#https://##' -e 's#http://##' -e 's#/$$##'); \
	DIST_ID=$$(aws cloudfront list-distributions --query "DistributionList.Items[?DomainName=='$$DOMAIN'].Id" --output text); \
	if [ -z "$$DIST_ID" ] || [ "$$DIST_ID" = "None" ]; then \
		echo "No CloudFront distribution found for $$DOMAIN; skipping."; \
	else \
		echo "Creating invalidation for distribution $$DIST_ID"; \
		aws cloudfront create-invalidation --distribution-id $$DIST_ID --paths "/*"; \
	fi
