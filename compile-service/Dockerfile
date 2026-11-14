# Image of the throw-away job containers: TeX Live only, nothing else, run with `--network none`.
#   docker build -t texbea-tex compile-service
FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends latexmk texlive-latex-recommended texlive-latex-extra \
      texlive-fonts-recommended texlive-fonts-extra texlive-science texlive-xetex texlive-luatex \
      texlive-lang-french texlive-lang-english texlive-lang-german texlive-lang-spanish texlive-bibtex-extra biber \
      texlive-publishers texlive-pictures texlive-plain-generic lmodern fontconfig \
 && rm -rf /var/lib/apt/lists/* \
 && fc-cache -f
USER 65534:65534
WORKDIR /work
