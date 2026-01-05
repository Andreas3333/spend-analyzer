FROM public.ecr.aws/lambda/python:3.13

WORKDIR /var/task

COPY requirements.txt ./

RUN python3.13 -m pip install -r requirements.txt -t .

RUN mkdir -p model
COPY model model/
COPY [ "main.py", "cls_head.py", "./" ]

CMD [ "main.handler" ]
