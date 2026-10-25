// Beamer themes shipped with the presentation templates. They are copied into the project as .sty files, so the
// slides compile the same way with pdfLaTeX or XeLaTeX, in the browser (SwiftLaTeX) or with latexmk, and the user
// can edit them. They only rely on beamer, TikZ and xcolor, which every TeX distribution has.

// "Moderne": white slides, accent rule under the title, section pages and a progress bar.
export const modernTheme = String.raw`\ProvidesPackage{beamerthemeTeXBea}[2026/10/25 TeXBea - theme moderne]
% Couleur principale : definie dans main.tex avec \definecolor{accent}{HTML}{...}
\providecolor{accent}{HTML}{DB7544}
\providecolor{encre}{HTML}{1E2430}
\providecolor{gris}{HTML}{6B7280}
\providecolor{fond}{HTML}{FFFFFF}
\RequirePackage{tikz}
\usetikzlibrary{babel,calc,positioning,arrows.meta,shapes.geometric}

% ---- Couleurs ------------------------------------------------------------
\setbeamercolor{normal text}{fg=encre,bg=fond}
\setbeamercolor{structure}{fg=accent}
\setbeamercolor{alerted text}{fg=accent!85!black}
\setbeamercolor{example text}{fg=accent!60!encre}
\setbeamercolor{frametitle}{fg=encre,bg=fond}
\setbeamercolor{title}{fg=encre}
\setbeamercolor{subtitle}{fg=gris}
\setbeamercolor{author}{fg=encre}
\setbeamercolor{institute}{fg=gris}
\setbeamercolor{date}{fg=gris}
\setbeamercolor{footline}{fg=gris}
\setbeamercolor{block title}{fg=fond,bg=accent}
\setbeamercolor{block body}{fg=encre,bg=accent!7}
\setbeamercolor{block title alerted}{fg=fond,bg=accent!75!black}
\setbeamercolor{block body alerted}{fg=encre,bg=accent!12}
\setbeamercolor{block title example}{fg=fond,bg=encre!80}
\setbeamercolor{block body example}{fg=encre,bg=encre!5}
\setbeamercolor{item projected}{fg=fond,bg=accent}

% ---- Polices ---------------------------------------------------------------
\setbeamerfont{title}{size=\LARGE,series=\bfseries}
\setbeamerfont{subtitle}{size=\large}
\setbeamerfont{frametitle}{size=\Large,series=\bfseries}
\setbeamerfont{framesubtitle}{size=\normalsize}
\setbeamerfont{footline}{size=\scriptsize}
\setbeamerfont{block title}{size=\normalsize,series=\bfseries}
\setbeamerfont{section title}{size=\huge,series=\bfseries}

% ---- Gabarits ------------------------------------------------------------
\setbeamertemplate{navigation symbols}{}
\setbeamertemplate{itemize item}{\raisebox{.15ex}{\color{accent}\rule{.9ex}{.9ex}}}
\setbeamertemplate{itemize subitem}{\color{accent}\textbullet}
\setbeamertemplate{enumerate item}{\color{accent}\bfseries\insertenumlabel.}
\setbeamertemplate{blocks}[rounded][shadow=false]
\setbeamertemplate{section in toc}{%
  {\color{accent}\bfseries\inserttocsectionnumber}\hspace{1em}\inserttocsection\par\medskip}
\setbeamertemplate{subsection in toc}{\hspace{2.2em}\small\color{gris}\inserttocsubsection\par}
\setbeamersize{text margin left=1.4cm,text margin right=1.4cm}

\newcommand{\tb@ratio}{0}
\newcommand{\tb@computeratio}{%
  \ifnum\inserttotalframenumber>1
    \pgfmathsetmacro{\tb@ratio}{min(1,(\insertframenumber-1)/(\inserttotalframenumber-1))}%
  \else\def\tb@ratio{0}\fi}

\setbeamertemplate{frametitle}{%
  \vskip.6cm
  \ifx\insertsection\@empty\else
    {\usebeamercolor[fg]{structure}\footnotesize\bfseries\insertsection\par\vskip.12cm}%
  \fi
  {\usebeamerfont{frametitle}\usebeamercolor[fg]{frametitle}\insertframetitle\par}%
  \ifx\insertframesubtitle\@empty\else
    \vskip.1cm{\usebeamerfont{framesubtitle}\color{gris}\insertframesubtitle\par}%
  \fi
  \vskip.2cm
  {\color{accent}\rule{1.6cm}{2pt}}%
  \vskip.1cm}

\setbeamertemplate{footline}{%
  \tb@computeratio
  \begin{beamercolorbox}[wd=\paperwidth,ht=3ex,dp=1.6ex,leftskip=1.4cm,rightskip=1.4cm]{footline}%
    \usebeamerfont{footline}\insertshorttitle\hfill\insertframenumber\,/\,\inserttotalframenumber
  \end{beamercolorbox}%
  \nointerlineskip
  \hbox{\begin{tikzpicture}
    \fill[accent!15] (0,0) rectangle (\paperwidth,2.5pt);
    \fill[accent] (0,0) rectangle ({\tb@ratio*\paperwidth},2.5pt);
  \end{tikzpicture}}}

\setbeamertemplate{title page}{%
  \begin{tikzpicture}[remember picture,overlay]
    \fill[accent] ($(current page.north east)+(-3,0)$) rectangle (current page.south east);
    \fill[accent!35] ($(current page.north east)+(-3.45,0)$) rectangle ($(current page.south east)+(-3.2,0)$);
    \fill[fond,opacity=.16] ($(current page.north east)+(-3,0)$) -- ++(3,0) -- ++(0,-3) -- cycle;
    \ifx\inserttitlegraphic\@empty\else
      \node[anchor=south east] at ($(current page.south east)+(-3.6,.5)$) {\inserttitlegraphic};
    \fi
  \end{tikzpicture}%
  \vfill
  \begin{minipage}{.72\textwidth}
    {\usebeamerfont{title}\usebeamercolor[fg]{title}\inserttitle\par}
    \ifx\insertsubtitle\@empty\else
      \vskip.25cm{\usebeamerfont{subtitle}\usebeamercolor[fg]{subtitle}\insertsubtitle\par}
    \fi
    \vskip.35cm{\color{accent}\rule{2.4cm}{3pt}}\vskip.4cm
    {\usebeamerfont{author}\usebeamercolor[fg]{author}\bfseries\insertauthor\par}
    \vskip.1cm{\usebeamerfont{institute}\usebeamercolor[fg]{institute}\small\insertinstitute\par}
    \vskip.3cm{\usebeamerfont{date}\usebeamercolor[fg]{date}\small\insertdate\par}
  \end{minipage}
  \vfill}

% Une page de transition au debut de chaque section.
\AtBeginSection{%
  \begingroup
  \setbeamertemplate{footline}{}
  \begin{frame}[plain]
    \vfill
    {\color{accent}\fontsize{54}{54}\selectfont\bfseries\thesection\par}
    \vskip.3cm
    {\usebeamerfont{section title}\insertsectionhead\par}
    \vskip.4cm
    {\color{accent}\rule{2.4cm}{3pt}}
    \vfill
  \end{frame}
  \endgroup}

% Grand chiffre cle : \chiffre{87 %}{des participants satisfaits}
\newcommand{\chiffre}[2]{%
  \begin{center}
    {\color{accent}\fontsize{40}{40}\selectfont\bfseries #1\par}
    \vskip.2cm{\color{gris}#2\par}
  \end{center}}
`;

// "Institutionnel": dark title slide, coloured header band and a three-part footer (author, title, page).
export const institutionalTheme = String.raw`\ProvidesPackage{beamerthemeTeXBeaPro}[2026/10/25 TeXBea - theme institutionnel]
% Couleurs : definies dans main.tex avec \definecolor{accent}{HTML}{...} et \definecolor{marine}{HTML}{...}
\providecolor{accent}{HTML}{DB7544}
\providecolor{marine}{HTML}{14213D}
\providecolor{encre}{HTML}{1F2937}
\providecolor{gris}{HTML}{6B7280}
\providecolor{fond}{HTML}{FFFFFF}
\RequirePackage{amssymb}
\RequirePackage{tikz}
\usetikzlibrary{babel,calc,positioning,arrows.meta}

\setbeamercolor{normal text}{fg=encre,bg=fond}
\setbeamercolor{structure}{fg=marine}
\setbeamercolor{alerted text}{fg=accent!90!black}
\setbeamercolor{frametitle}{fg=fond,bg=marine}
\setbeamercolor{title}{fg=fond}
\setbeamercolor{subtitle}{fg=fond!80!marine}
\setbeamercolor{block title}{fg=fond,bg=marine}
\setbeamercolor{block body}{fg=encre,bg=marine!6}
\setbeamercolor{block title alerted}{fg=fond,bg=accent}
\setbeamercolor{block body alerted}{fg=encre,bg=accent!10}
\setbeamercolor{block title example}{fg=fond,bg=marine!65}
\setbeamercolor{block body example}{fg=encre,bg=marine!4}
\setbeamercolor{pied gauche}{fg=fond,bg=marine}
\setbeamercolor{pied centre}{fg=fond,bg=marine!85}
\setbeamercolor{pied droite}{fg=marine,bg=accent}

\setbeamerfont{title}{size=\LARGE,series=\bfseries}
\setbeamerfont{subtitle}{size=\large}
\setbeamerfont{frametitle}{size=\large,series=\bfseries}
\setbeamerfont{footline}{size=\tiny}
\setbeamerfont{block title}{size=\normalsize,series=\bfseries}

\setbeamertemplate{navigation symbols}{}
\setbeamertemplate{itemize item}{\color{accent}$\blacktriangleright$}
\setbeamertemplate{itemize subitem}{\color{marine}\textendash}
\setbeamertemplate{enumerate item}[circle]
\setbeamercolor{item projected}{fg=fond,bg=marine}
\setbeamertemplate{blocks}[rounded][shadow=false]
\setbeamertemplate{sections/subsections in toc}[square]
\setbeamersize{text margin left=1cm,text margin right=1cm}

\setbeamertemplate{frametitle}{%
  \nointerlineskip
  \begin{beamercolorbox}[wd=\paperwidth,ht=1.25cm,dp=.45cm,leftskip=1cm,rightskip=1cm]{frametitle}%
    \usebeamerfont{frametitle}\insertframetitle
    \ifx\insertframesubtitle\@empty\else\\[2pt]{\small\mdseries\color{fond!75!marine}\insertframesubtitle}\fi
  \end{beamercolorbox}%
  \nointerlineskip
  \hbox{\color{accent}\rule{\paperwidth}{2pt}}%
  \vskip.25cm}

\setbeamertemplate{footline}{%
  \leavevmode\hbox{%
    \begin{beamercolorbox}[wd=.3\paperwidth,ht=2.6ex,dp=1.2ex,leftskip=1em]{pied gauche}%
      \usebeamerfont{footline}\insertshortauthor
    \end{beamercolorbox}%
    \begin{beamercolorbox}[wd=.55\paperwidth,ht=2.6ex,dp=1.2ex,center]{pied centre}%
      \usebeamerfont{footline}\insertshorttitle
    \end{beamercolorbox}%
    \begin{beamercolorbox}[wd=.15\paperwidth,ht=2.6ex,dp=1.2ex,center]{pied droite}%
      \usebeamerfont{footline}\bfseries\insertframenumber\,/\,\inserttotalframenumber
    \end{beamercolorbox}}}

\setbeamertemplate{title page}{%
  \begin{tikzpicture}[remember picture,overlay]
    \fill[marine] (current page.south west) rectangle (current page.north east);
    \fill[accent] (current page.south west) rectangle ($(current page.south east)+(0,.35)$);
    \foreach \r/\o in {3.2/.06,2.3/.08,1.4/.1}
      \fill[fond,opacity=\o] (current page.north east) circle (\r);
    \ifx\inserttitlegraphic\@empty\else
      \node[anchor=north west] at ($(current page.north west)+(1,-.6)$) {\inserttitlegraphic};
    \fi
  \end{tikzpicture}%
  \vfill
  {\usebeamerfont{title}\usebeamercolor[fg]{title}\inserttitle\par}
  \ifx\insertsubtitle\@empty\else
    \vskip.2cm{\usebeamerfont{subtitle}\usebeamercolor[fg]{subtitle}\insertsubtitle\par}
  \fi
  \vskip.4cm{\color{accent}\rule{3cm}{2.5pt}}\vskip.4cm
  {\color{fond}\bfseries\insertauthor\par}
  \vskip.1cm{\color{fond!75!marine}\small\insertinstitute\par}
  \vskip.25cm{\color{fond!75!marine}\small\insertdate\par}
  \vfill\vfill}

\AtBeginSection{%
  \begingroup
  \setbeamertemplate{footline}{}
  \begin{frame}[plain]
    \begin{tikzpicture}[remember picture,overlay]
      \fill[marine] (current page.south west) rectangle (current page.north east);
      \fill[accent] ($(current page.west)+(1,-.05)$) rectangle ++(2.4,.1);
    \end{tikzpicture}
    \vfill
    {\color{accent}\large\bfseries Partie \thesection\par}
    \vskip.2cm
    {\color{fond}\huge\bfseries\insertsectionhead\par}
    \vskip1.4cm
    \vfill
  \end{frame}
  \endgroup}
`;
