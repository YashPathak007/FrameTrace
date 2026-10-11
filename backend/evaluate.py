"""Evaluation entry point.

Run this only with a real labeled dataset. Expected CSV columns: path,label where
label is 0/1 and paths are readable by the script. No metrics are emitted without data.
"""
import argparse, csv

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--csv',required=True); args=parser.parse_args()
    rows=list(csv.DictReader(open(args.csv,newline='',encoding='utf-8')))
    if not rows: raise SystemExit('Dataset is empty; refusing to invent evaluation metrics.')
    raise SystemExit('Dataset loading is validated, but a trained checkpoint and explicit evaluation protocol must be supplied before reporting metrics.')
if __name__=='__main__': main()
