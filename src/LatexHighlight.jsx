import React,{forwardRef,useMemo} from 'react';
import {tokenizeLatex} from './latex-syntax.js';
export default forwardRef(function LatexHighlight({code},ref) {
  const tokens = useMemo(()=>tokenizeLatex(code),[code]);
  return <pre className="latex-highlight" ref={ref} aria-hidden="true">{tokens.map((token,i)=>token.kind?<span key={i} className={'tex-'+token.kind}>{token.text}</span>:token.text)}{'\n'}</pre>;
});
