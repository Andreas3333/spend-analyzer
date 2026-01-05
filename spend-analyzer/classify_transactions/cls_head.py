from typing_extensions import Self

from torch import nn
from transformers import PreTrainedModel, BertConfig, BertModel
from transformers.modeling_outputs import SequenceClassifierOutput


class BertForSeqClassificationMLPHeadConfig(BertConfig):
    model_type = "bert"
    problem_type = "classification"
    finetuning_task = "multi_class_seq_classification"
    
    def __init__(self, **kwargs)-> None:
        super().__init__(**kwargs)

class BertForSeqClassificationMLPHead(PreTrainedModel):
    """
    Adds a classification head to google-bert/bert-base-uncased for multi class classification
    for training only the head layer.

    For use with HF Trainer
    """
    config_class = BertForSeqClassificationMLPHeadConfig

    def __init__(self, config, base_bert_checkpoint = None, **kwargs) -> None:
        super().__init__(config)
        if base_bert_checkpoint:
            self.bert = BertModel.from_pretrained(
                pretrained_model_name_or_path=base_bert_checkpoint,
                config=config,
                **kwargs
                )
        else:
            self.bert = None
        self.classifier = nn.Sequential(
            nn.Linear(self.config.hidden_size, 512),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.LayerNorm(512),
            nn.Linear(512, 256),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(256, self.config.num_labels)
        )

    def forward(self, input_ids=None, attention_mask=None, token_type_ids=None, **kwargs) -> SequenceClassifierOutput:
        kwargs.pop("num_items_in_batch", None)

        outputs = self.bert(
            input_ids=input_ids,
            attention_mask=attention_mask,
            token_type_ids=token_type_ids,
            **kwargs,
        )
        # Prefer explicit pooler_output if available; otherwise fall back to CLS token
        pooler_output = getattr(outputs, "pooler_output", None)
        if pooler_output is None:
            last_hidden = getattr(outputs, "last_hidden_state", None)
            if last_hidden is None:
                last_hidden = outputs[0]
            pooler_output = last_hidden[:, 0]
        logits = self.classifier(pooler_output)

        return SequenceClassifierOutput(loss=None, logits=logits)
    
    def train(self) -> Self:
        if self.bert is not None:
            self.bert.train()
        self.classifier.train()
        return self

    def eval(self)-> Self:
        if self.bert is not None:
            self.bert.eval()
        self.classifier.eval()
        return self
