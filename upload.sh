#!/bin/bash
rsync -a --exclude "node_modules" . root@dataset.nlpkit.net:/home/dataset-creator-server