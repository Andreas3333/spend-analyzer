"""
Cognito PostConfirmation trigger - create a per-user S3 prefix for user data storage.
"""
import os
import boto3

S3_BUCKET = os.environ.get("USER_DATA_BUCKET")
s3 = boto3.client("s3")


def handler(event, context):
    try:
        attrs = event.get("request", {}).get("userAttributes", {}) or {}
        email = attrs.get("email")
        if not email or not S3_BUCKET:
            return event

        # Use the email as the prefix. Create a zero-length object to represent the folder.
        key = f"{email.rstrip('/')}/"
        s3.put_object(Bucket=S3_BUCKET, Key=key)
    except Exception:
        # Don't fail user signup if this action errors
        pass
    return event
