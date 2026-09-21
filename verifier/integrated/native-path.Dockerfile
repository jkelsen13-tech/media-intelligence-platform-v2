# Existing private Qualification Lab Python base; no credentials or source copied.
FROM python@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7
RUN pip install --no-cache-dir --no-deps \
    psycopg==3.2.10 psycopg-binary==3.2.10 \
    requests==2.32.5 beautifulsoup4==4.13.5 soupsieve==2.8 typing_extensions==4.15.0 \
    charset-normalizer==3.4.3 idna==3.10 urllib3==2.5.0 certifi==2025.8.3
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONNOUSERSITE=1
ENTRYPOINT ["python","-I","-B"]
