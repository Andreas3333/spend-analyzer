"""
Real time inference handler for classifying transaction descriptions using SFT BERT model.

Reads data from S3, performs inference, and writes results back to S3.
"""

import os
import io
import base64
import time

import torch
from torch.utils.data import DataLoader, Dataset
from transformers import BertTokenizer, BertModel
from safetensors.torch import load_model
from cls_head import BertForSeqClassificationMLPHead, BertForSeqClassificationMLPHeadConfig

import pandas as pd
import s3fs


CACHE_DIR = f"{os.getcwd()}/model/"

print(f"Initializing model from {CACHE_DIR}")
device = torch.device("cpu")
print(f"Using device: {device}")

try:
    # START TIMING: Model Load
    load_start_time = time.perf_counter()

    config_path = os.path.join(CACHE_DIR, "config.json")
    if not os.path.exists(config_path):
        raise FileNotFoundError(f"Config file not found at {config_path}")
    
    config = BertForSeqClassificationMLPHeadConfig.from_json_file(config_path)
    model = BertForSeqClassificationMLPHead(config)
    
    model.bert = BertModel(config, add_pooling_layer=False)
    
    base_weights_path = os.path.join(CACHE_DIR, "bert_base.safetensors")
    if not os.path.exists(base_weights_path):
        raise FileNotFoundError(f"Base weights not found at {base_weights_path}")
    load_model(model.bert, base_weights_path)
    
    head_weights_path = os.path.join(CACHE_DIR, "classifier_head.safetensors")
    if not os.path.exists(head_weights_path):
        raise FileNotFoundError(f"Head weights not found at {head_weights_path}")
    load_model(model.classifier, head_weights_path)
    
    model.to(device)
    model.eval()
    
    try:
        tokenizer = BertTokenizer.from_pretrained(CACHE_DIR, local_files_only=True)
    except Exception:
        print("Could not load tokenizer from CACHE_DIR, attempting standard load (may fail without internet)")
        tokenizer = BertTokenizer.from_pretrained("google-bert/bert-base-uncased")
    
    try:
        tokenizer = BertTokenizer.from_pretrained(CACHE_DIR, local_files_only=True)
    except Exception:
        print("Could not load tokenizer from CACHE_DIR, attempting standard load (may fail without internet)")
        tokenizer = BertTokenizer.from_pretrained("google-bert/bert-base-uncased")

    # END TIMING: Model Load
    end_time = time.perf_counter()
    execution_time = end_time - load_start_time
    print(f"Total model load time: {execution_time:.4f} seconds")
    print("Model and Tokenizer loaded successfully.")

except Exception as e:
    print(f"Failed to load model: {e}")
    model = None
    tokenizer = None


class InferenceDataset(Dataset):
    def __init__(self, texts, labels, tokenizer, max_len=128):
        self.texts = texts
        self.labels = labels
        self.tokenizer = tokenizer
        self.max_len = max_len

    def __len__(self):
        return len(self.texts)

    def __getitem__(self, idx):
        text = str(self.texts[idx])
        label = self.labels[idx]
        
        # Tokenize
        encoding = self.tokenizer(
            text,
            truncation=True,
            padding="max_length",
            max_length=self.max_len,
            return_tensors="pt"
        )
        
        return {
            "input_ids": encoding["input_ids"].flatten(),
            "attention_mask": encoding["attention_mask"].flatten(),
            "token_type_ids": encoding["token_type_ids"].flatten(),
            "label": label,
            "text_raw": text
        }


def handler(event, context):
    print("Inference Status: started...")
    if model is None or tokenizer is None:
        raise Exception("Model or tokenizer not initialized")
    
    user_bucket = os.environ.get('USER_DATA_BUCKET') or os.environ.get('USER_DATA_BUCKET_NAME')
    if not user_bucket:
        raise Exception("USER_DATA_BUCKET environment variable not set")

    try:
        username = event.get('username')
        csv_text = base64.b64decode(event.get("body").get("csv")).decode('utf-8')
        ds_name = event.get('queryStringParameters', {}).get('dataset')
        
        df = pd.read_csv(io.StringIO(csv_text))

        cols_lower = [c.lower() for c in df.columns]
        if 'text' in cols_lower:
            text_col = df.columns[cols_lower.index('text')]
        else:
            # prefer explicit Transaction Description variants
            candidate = None
            for i, c in enumerate(cols_lower):
                if 'transaction description' in c or 'transactions description' in c or c == 'description':
                    candidate = df.columns[i]
                    break
            text_col = candidate or df.columns[0]

        # If Category column exists use it, otherwise create dummy labels
        if 'category' in cols_lower:
            label_col = df.columns[cols_lower.index('category')]
            labels = df[label_col].fillna(0).to_list()
        else:
            labels = [0] * len(df)

        dataset = InferenceDataset(
            texts=df[text_col].to_list(),
            labels=labels,
            tokenizer=tokenizer
        )
        dataloader = DataLoader(dataset, batch_size=32, shuffle=False)

        result_df = pd.DataFrame(columns=["Transaction Description", "Predicted Category", "Confidence Score"])

        # START TIMING: Inference
        inference_start_time = time.perf_counter()
        with torch.no_grad():
            for batch in dataloader:

                input_ids = batch["input_ids"].to(device)
                attention_mask = batch["attention_mask"].to(device)
                token_type_ids = batch["token_type_ids"].to(device)

                outputs = model(
                    input_ids=input_ids, 
                    attention_mask=attention_mask, 
                    token_type_ids=token_type_ids
                )

                logits = outputs.logits
                preds = torch.argmax(logits, dim=1)

                current_texts = batch["text_raw"]

                # Build result df
                for i, pred_idx in enumerate(preds):
                    clean_idx = int(pred_idx)
                    str_idx = str(clean_idx)

                    pred_label = model.config.id2label.get(
                        str_idx,
                        model.config.id2label.get(clean_idx, f"UNKNOWN"))

                    confidence = torch.softmax(logits, dim=1)[i][pred_idx].item()

                    result_df = pd.concat([result_df, pd.DataFrame({
                        "Transaction Description": [current_texts[i][:40]],  
                        "Predicted Category": [str(pred_label)],
                        "Confidence Score": [confidence]
                    })], ignore_index=True)            

        # END TIMING: Inference
        end_time = time.perf_counter()
        execution_time = end_time - inference_start_time
        print(f"Total inference time: {execution_time:.4f} seconds")
        print("Inference Status: completed")

        # Write results to configured user data bucket
        out_path = f"s3://{user_bucket}/{username}/{ds_name.split('.')[0].replace("-upload", "-out")}.csv"
        result_df.to_csv(out_path, index=False)

        print(f"Inference Complete, output_s3_path: {out_path}")

    except Exception as e:
        print(f"Inference error: {e}")

