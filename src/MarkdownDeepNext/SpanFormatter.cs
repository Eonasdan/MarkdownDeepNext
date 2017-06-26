using System;
using System.Collections.Generic;
using System.Text;

namespace MarkdownDeep
{
    internal class SpanFormatter : StringScanner
    {
        // Constructor
        // A reference to the owning markdown object is passed incase
        // we need to check for formatting options
        public SpanFormatter(Markdown m)
        {
            _mMarkdown = m;
        }


        internal void FormatParagraph(StringBuilder dest, string str, int start, int len)
        {
            // Parse the string into a list of tokens
            Tokenize(str, start, len);

            // Titled image?
            if (_mTokens.Count == 1 && _mMarkdown.HtmlClassTitledImages != null && _mTokens[0].Type == TokenType.img)
            {
                // Grab the link info
                var li = (LinkInfo)_mTokens[0].Data;

                // Render the div opening
                dest.Append("<div class=\"");
                dest.Append(_mMarkdown.HtmlClassTitledImages);
                dest.Append("\">\n");

                // Render the img
                _mMarkdown.RenderingTitledImage = true;
                Render(dest, str);
                _mMarkdown.RenderingTitledImage = false;
                dest.Append("\n");

                // Render the title
                if (!string.IsNullOrEmpty(li.Def.Title))
                {
                    dest.Append("<p>");
                    Utils.SmartHtmlEncodeAmpsAndAngles(dest, li.Def.Title);
                    dest.Append("</p>\n");
                }

                dest.Append("</div>\n");
            }
            else
            {
                // Render the paragraph
                dest.Append("<p>");
                Render(dest, str);
                dest.Append("</p>\n");
            }
        }

        internal void Format(StringBuilder dest, string str)
        {
            Format(dest, str, 0, str.Length);
        }

        // Format a range in an input string and write it to the destination string builder.
        internal void Format(StringBuilder dest, string str, int start, int len)
        {
            // Parse the string into a list of tokens
            Tokenize(str, start, len);

            // Render all tokens
            Render(dest, str);
        }

        internal void FormatPlain(StringBuilder dest, string str, int start, int len)
        {
            // Parse the string into a list of tokens
            Tokenize(str, start, len);

            // Render all tokens
            RenderPlain(dest, str);
        }

        // Format a string and return it as a new string
        // (used in formatting the text of links)
        internal string Format(string str)
        {
            var dest = new StringBuilder();
            Format(dest, str, 0, str.Length);
            return dest.ToString();
        }

        internal string MakeID(string str)
        {
            return MakeID(str, 0, str.Length);
        }

        internal string MakeID(string str, int start, int len)
        {
            // Parse the string into a list of tokens
            Tokenize(str, start, len);

            var sb = new StringBuilder();

            foreach (var t in _mTokens)
            {
                switch (t.Type)
                {
                    case TokenType.Text:
                        sb.Append(str, t.StartOffset, t.Length);
                        break;

                    case TokenType.link:
                        var li = (LinkInfo)t.Data;
                        sb.Append(li.LinkText);
                        break;
                }

                FreeToken(t);
            }

            // Now clean it using the same rules as pandoc
            Reset(sb.ToString());

            // Skip everything up to the first letter
            while (!Eof)
            {
                if (char.IsLetter(Current))
                    break;
                SkipForward(1);
            }

            // Process all characters
            sb.Length = 0;
            while (!Eof)
            {
                var ch = Current;
                if (char.IsLetterOrDigit(ch) || ch == '_' || ch == '-' || ch == '.')
                    sb.Append(char.ToLower(ch));
                else if (ch == ' ')
                    sb.Append("-");
                else if (IsLineEnd(ch))
                {
                    sb.Append("-");
                    SkipEol();
                    continue;
                }

                SkipForward(1);
            }

            return sb.ToString();
        }

        // Render a list of tokens to a destination string builder.
        private void Render(StringBuilder sb, string str)
        {
            foreach (var t in _mTokens)
            {
                switch (t.Type)
                {
                    case TokenType.Text:
                        // Append encoded text
                        _mMarkdown.HtmlEncode(sb, str, t.StartOffset, t.Length);
                        break;

                    case TokenType.HtmlTag:
                        // Append html as is
                        Utils.SmartHtmlEncodeAmps(sb, str, t.StartOffset, t.Length);
                        break;

                    case TokenType.Html:
                    case TokenType.opening_mark:
                    case TokenType.closing_mark:
                    case TokenType.internal_mark:
                        // Append html as is
                        sb.Append(str, t.StartOffset, t.Length);
                        break;

                    case TokenType.br:
                        sb.Append("<br />\n");
                        break;

                    case TokenType.open_em:
                        sb.Append("<em>");
                        break;

                    case TokenType.close_em:
                        sb.Append("</em>");
                        break;

                    case TokenType.open_strong:
                        sb.Append("<strong>");
                        break;

                    case TokenType.close_strong:
                        sb.Append("</strong>");
                        break;

                    case TokenType.code_span:
                        sb.Append("<code>");
                        _mMarkdown.HtmlEncode(sb, str, t.StartOffset, t.Length);
                        sb.Append("</code>");
                        break;

                    case TokenType.link:
                        {
                            var li = (LinkInfo)t.Data;
                            var sf = new SpanFormatter(_mMarkdown) {DisableLinks = true};

                            li.Def.RenderLink(_mMarkdown, sb, sf.Format(li.LinkText));
                            break;
                        }

                    case TokenType.img:
                        {
                            var li = (LinkInfo)t.Data;
                            li.Def.RenderImg(_mMarkdown, sb, li.LinkText);
                            break;
                        }

                    case TokenType.footnote:
                        {
                            var r = (FootnoteReference)t.Data;
                            // ReSharper disable once StringLiteralTypo
                            sb.Append("<sup id=\"fnref:");
                            sb.Append(r.ID);
                            sb.Append("\"><a href=\"#fn:");
                            sb.Append(r.ID);
                            sb.Append("\" rel=\"footnote\">");
                            sb.Append(r.Index + 1);
                            sb.Append("</a></sup>");
                            break;
                        }

                    case TokenType.abbreviation:
                        {
                            var a = (Abbreviation)t.Data;
                            sb.Append("<abbr");
                            if (!string.IsNullOrEmpty(a.Title))
                            {
                                sb.Append(" title=\"");
                                _mMarkdown.HtmlEncode(sb, a.Title, 0, a.Title.Length);
                                sb.Append("\"");
                            }
                            sb.Append(">");
                            _mMarkdown.HtmlEncode(sb, a.Abbr, 0, a.Abbr.Length);
                            sb.Append("</abbr>");
                            break;
                        }
                }

                FreeToken(t);
            }
        }

        // Render a list of tokens to a destination string builder.
        private void RenderPlain(StringBuilder sb, string str)
        {
            foreach (var t in _mTokens)
            {
                switch (t.Type)
                {
                    case TokenType.Text:
                        sb.Append(str, t.StartOffset, t.Length);
                        break;

                    case TokenType.HtmlTag:
                        break;

                    case TokenType.Html:
                    case TokenType.opening_mark:
                    case TokenType.closing_mark:
                    case TokenType.internal_mark:
                        break;

                    case TokenType.br:
                        break;

                    case TokenType.open_em:
                    case TokenType.close_em:
                    case TokenType.open_strong:
                    case TokenType.close_strong:
                        break;

                    case TokenType.code_span:
                        sb.Append(str, t.StartOffset, t.Length);
                        break;

                    case TokenType.link:
                        {
                            var li = (LinkInfo)t.Data;
                            sb.Append(li.LinkText);
                            break;
                        }

                    case TokenType.img:
                        {
                            var li = (LinkInfo)t.Data;
                            sb.Append(li.LinkText);
                            break;
                        }

                    case TokenType.footnote:
                    case TokenType.abbreviation:
                        break;
                }

                FreeToken(t);
            }
        }

        // Scan the input string, creating tokens for anything special 
        public void Tokenize(string str, int start, int len)
        {
            // Prepare
            Reset(str, start, len);
            _mTokens.Clear();

            List<Token> emphasisMarks = null;

            var abbreviations = _mMarkdown.GetAbbreviations();
            var extraMode = _mMarkdown.ExtraMode;

            // Scan string
            var startTextToken = Position;
            while (!Eof)
            {
                var endTextToken = Position;

                // Work out token
                Token token = null;
                switch (Current)
                {
                    case '*':
                    case '_':

                        // Create emphasis mark
                        token = CreateEmphasisMark();

                        if (token != null)
                        {
                            // Store marks in a separate list the we'll resolve later
                            switch (token.Type)
                            {
                                case TokenType.internal_mark:
                                case TokenType.opening_mark:
                                case TokenType.closing_mark:
                                    if (emphasisMarks == null)
                                    {
                                        emphasisMarks = new List<Token>();
                                    }
                                    emphasisMarks.Add(token);
                                    break;
                            }
                        }
                        break;

                    case '`':
                        token = ProcessCodeSpan();
                        break;

                    case '[':
                    case '!':
                        {
                            // Process link reference
                            var linkPosition = Position;
                            token = ProcessLinkOrImageOrFootnote();

                            // Rewind if invalid syntax
                            // (the '[' or '!' will be treated as a regular character and processed below)
                            if (token == null)
                                Position = linkPosition;
                            break;
                        }

                    case '<':
                        {
                            // Is it a valid html tag?
                            var save = Position;
                            var tag = HtmlTag.Parse(this);
                            if (tag != null)
                            {
                                if (!_mMarkdown.SafeMode || tag.IsSafe())
                                {
                                    // Yes, create a token for it
                                    token = CreateToken(TokenType.HtmlTag, save, Position - save);
                                }
                                else
                                {
                                    // No, rewrite and encode it
                                    Position = save;
                                }
                            }
                            else
                            {
                                // No, rewind and check if it's a valid autolink eg: <google.com>
                                Position = save;
                                token = ProcessAutoLink();

                                if (token == null)
                                    Position = save;
                            }
                            break;
                        }

                    case '&':
                        {
                            // Is it a valid html entity
                            var save = Position;
                            string unused = null;
                            if (SkipHtmlEntity(ref unused))
                            {
                                // Yes, create a token for it
                                token = CreateToken(TokenType.Html, save, Position - save);
                            }

                            break;
                        }

                    case ' ':
                        {
                            // Check for double space at end of a line
                            if (CharAtOffset(1) == ' ' && IsLineEnd(CharAtOffset(2)))
                            {
                                // Yes, skip it
                                SkipForward(2);

                                // Don't put br's at the end of a paragraph
                                if (!Eof)
                                {
                                    SkipEol();
                                    token = CreateToken(TokenType.br, endTextToken, 0);
                                }
                            }
                            break;
                        }

                    case '\\':
                        {
                            // Special handling for escaping <autolinks>
                            /*
                            if (CharAtOffset(1) == '<')
                            {
                                // Is it an autolink?
                                int savePosition = position;
                                SkipForward(1);
                                bool AutoLink = ProcessAutoLink() != null;
                                position = savePosition;

                                if (AutoLink)
                                {
                                    token = CreateToken(TokenType.Text, position + 1, 1);
                                    SkipForward(2);
                                }
                            }
                            else
                             */
                            {
                                // Check followed by an escapable character
                                if (Utils.IsEscapableChar(CharAtOffset(1), extraMode))
                                {
                                    token = CreateToken(TokenType.Text, Position + 1, 1);
                                    SkipForward(2);
                                }
                            }
                            break;
                        }
                }

                // Look for abbreviations.
                if (token == null && abbreviations != null && !char.IsLetterOrDigit(CharAtOffset(-1)))
                {
                    var savePosition = Position;
                    foreach (var abbr in abbreviations)
                    {
                        if (SkipString(abbr.Abbr) && !char.IsLetterOrDigit(Current))
                        {
                            token = CreateToken(TokenType.abbreviation, abbr);
                            break;
                        }

                        Position = savePosition;
                    }

                }

                // If token found, append any preceding text and the new token to the token list
                if (token != null)
                {
                    // Create a token for everything up to the special character
                    if (endTextToken > startTextToken)
                    {
                        _mTokens.Add(CreateToken(TokenType.Text, startTextToken, endTextToken - startTextToken));
                    }

                    // Add the new token
                    _mTokens.Add(token);

                    // Remember where the next text token starts
                    startTextToken = Position;
                }
                else
                {
                    // Skip a single character and keep looking
                    SkipForward(1);
                }
            }

            // Append a token for any trailing text after the last token.
            if (Position > startTextToken)
            {
                _mTokens.Add(CreateToken(TokenType.Text, startTextToken, Position - startTextToken));
            }

            // Do we need to resolve and emphasis marks?
            if (emphasisMarks != null)
            {
                ResolveEmphasisMarks(_mTokens, emphasisMarks);
            }

            // Done!
        }

        private static bool IsEmphasisChar(char ch)
        {
            return ch == '_' || ch == '*';
        }

        /*
		 * Resolving emphasis tokens is a two part process
		 * 
		 * 1. Find all valid sequences of * and _ and create `mark` tokens for them
		 *		this is done by CreateEmphasisMarks during the initial character scan
		 *		done by Tokenize
		 *		
		 * 2. Looks at all these emphasis marks and tries to pair them up
		 *		to make the actual <em> and <strong> tokens
		 *		
		 * Any unresolved emphasis marks are rendered unaltered as * or _
		 */

        // Create emphasis mark for sequences of '*' and '_' (part 1)
        public Token CreateEmphasisMark()
        {
            // Capture current state
            var ch = Current;
            var savePosition = Position;

            // Check for a consecutive sequence of just '_' and '*'
            if (Bof || char.IsWhiteSpace(CharAtOffset(-1)))
            {
                while (IsEmphasisChar(Current))
                    SkipForward(1);

                if (Eof || char.IsWhiteSpace(Current))
                {
                    return new Token(TokenType.Html, savePosition, Position - savePosition);
                }

                // Rewind
                Position = savePosition;
            }

            // Scan backwards and see if we have space before
            while (IsEmphasisChar(CharAtOffset(-1)))
                SkipForward(-1);
            var bSpaceBefore = Bof || char.IsWhiteSpace(CharAtOffset(-1));
            Position = savePosition;

            // Count how many matching emphasis characters
            while (Current == ch)
            {
                SkipForward(1);
            }
            var count = Position - savePosition;

            // Scan forwards and see if we have space after
            while (IsEmphasisChar(CharAtOffset(1)))
                SkipForward(1);
            var bSpaceAfter = Eof || char.IsWhiteSpace(Current);
            Position = savePosition + count;

            // This should have been stopped by check above
            System.Diagnostics.Debug.Assert(!bSpaceBefore || !bSpaceAfter);

            if (bSpaceBefore)
            {
                return CreateToken(TokenType.opening_mark, savePosition, Position - savePosition);
            }

            if (bSpaceAfter)
            {
                return CreateToken(TokenType.closing_mark, savePosition, Position - savePosition);
            }

            if (_mMarkdown.ExtraMode && ch == '_' && (char.IsLetterOrDigit(Current)))
                return null;

            return CreateToken(TokenType.internal_mark, savePosition, Position - savePosition);
        }

        // Split mark token
        public Token SplitMarkToken(List<Token> tokens, List<Token> marks, Token token, int position)
        {
            // Create the new rhs token
            var tokenRhs = CreateToken(token.Type, token.StartOffset + position, token.Length - position);

            // Adjust down the length of this token
            token.Length = position;

            // Insert the new token into each of the parent collections
            marks.Insert(marks.IndexOf(token) + 1, tokenRhs);
            tokens.Insert(tokens.IndexOf(token) + 1, tokenRhs);

            // Return the new token
            return tokenRhs;
        }

        // Resolve emphasis marks (part 2)
        public void ResolveEmphasisMarks(List<Token> tokens, List<Token> marks)
        {
            var bContinue = true;
            while (bContinue)
            {
                bContinue = false;
                for (var i = 0; i < marks.Count; i++)
                {
                    // Get the next opening or internal mark
                    var openingMark = marks[i];
                    if (openingMark.Type != TokenType.opening_mark && openingMark.Type != TokenType.internal_mark)
                        continue;

                    // Look for a matching closing mark
                    for (var j = i + 1; j < marks.Count; j++)
                    {
                        // Get the next closing or internal mark
                        var closingMark = marks[j];
                        if (closingMark.Type != TokenType.closing_mark && closingMark.Type != TokenType.internal_mark)
                            break;

                        // Ignore if different type (ie: `*` vs `_`)
                        if (Input[openingMark.StartOffset] != Input[closingMark.StartOffset])
                            continue;

                        // strong or em?
                        var style = Math.Min(openingMark.Length, closingMark.Length);

                        // Triple or more on both ends?
                        if (style >= 3)
                        {
                            style = (style % 2) == 1 ? 1 : 2;
                        }

                        // Split the opening mark, keeping the RHS
                        if (openingMark.Length > style)
                        {
                            openingMark = SplitMarkToken(tokens, marks, openingMark, openingMark.Length - style);
                            i--;
                        }

                        // Split the closing mark, keeping the LHS
                        if (closingMark.Length > style)
                        {
                            SplitMarkToken(tokens, marks, closingMark, style);
                        }

                        // Connect them
                        openingMark.Type = style == 1 ? TokenType.open_em : TokenType.open_strong;
                        closingMark.Type = style == 1 ? TokenType.close_em : TokenType.close_strong;

                        // Remove the matched marks
                        marks.Remove(openingMark);
                        marks.Remove(closingMark);
                        bContinue = true;

                        break;
                    }
                }
            }
        }

        // Resolve emphasis marks (part 2)
        public void ResolveEmphasisMarks_classic(List<Token> tokens, List<Token> marks)
        {
            // First pass, do <strong>
            for (var i = 0; i < marks.Count; i++)
            {
                // Get the next opening or internal mark
                var openingMark = marks[i];
                if (openingMark.Type != TokenType.opening_mark && openingMark.Type != TokenType.internal_mark)
                    continue;
                if (openingMark.Length < 2)
                    continue;

                // Look for a matching closing mark
                for (var j = i + 1; j < marks.Count; j++)
                {
                    // Get the next closing or internal mark
                    var closingMark = marks[j];
                    if (closingMark.Type != TokenType.closing_mark && closingMark.Type != TokenType.internal_mark)
                        continue;

                    // Ignore if different type (ie: `*` vs `_`)
                    if (Input[openingMark.StartOffset] != Input[closingMark.StartOffset])
                        continue;

                    // Must be at least two
                    if (closingMark.Length < 2)
                        continue;

                    // Split the opening mark, keeping the LHS
                    if (openingMark.Length > 2)
                    {
                        SplitMarkToken(tokens, marks, openingMark, 2);
                    }

                    // Split the closing mark, keeping the RHS
                    if (closingMark.Length > 2)
                    {
                        closingMark = SplitMarkToken(tokens, marks, closingMark, closingMark.Length - 2);
                    }

                    // Connect them
                    openingMark.Type = TokenType.open_strong;
                    closingMark.Type = TokenType.close_strong;

                    // Continue after the closing mark
                    i = marks.IndexOf(closingMark);
                    break;
                }
            }

            // Second pass, do <em>
            for (var i = 0; i < marks.Count; i++)
            {
                // Get the next opening or internal mark
                var openingMark = marks[i];
                if (openingMark.Type != TokenType.opening_mark && openingMark.Type != TokenType.internal_mark)
                    continue;

                // Look for a matching closing mark
                for (var j = i + 1; j < marks.Count; j++)
                {
                    // Get the next closing or internal mark
                    var closingMark = marks[j];
                    if (closingMark.Type != TokenType.closing_mark && closingMark.Type != TokenType.internal_mark)
                        continue;

                    // Ignore if different type (ie: `*` vs `_`)
                    if (Input[openingMark.StartOffset] != Input[closingMark.StartOffset])
                        continue;

                    // Split the opening mark, keeping the LHS
                    if (openingMark.Length > 1)
                    {
                        SplitMarkToken(tokens, marks, openingMark, 1);
                    }

                    // Split the closing mark, keeping the RHS
                    if (closingMark.Length > 1)
                    {
                        closingMark = SplitMarkToken(tokens, marks, closingMark, closingMark.Length - 1);
                    }

                    // Connect them
                    openingMark.Type = TokenType.open_em;
                    closingMark.Type = TokenType.close_em;

                    // Continue after the closing mark
                    i = marks.IndexOf(closingMark);
                    break;
                }
            }
        }

        // Process auto links eg: <google.com>
        private Token ProcessAutoLink()
        {
            if (DisableLinks)
                return null;

            // Skip the angle bracket and remember the start
            SkipForward(1);
            Mark();

            var extraMode = _mMarkdown.ExtraMode;

            // Allow anything up to the closing angle, watch for escapable characters
            while (!Eof)
            {
                var ch = Current;

                // No whitespace allowed
                if (char.IsWhiteSpace(ch))
                    break;

                // End found?
                if (ch == '>')
                {
                    var url = Utils.UnescapeString(Extract(), extraMode);

                    LinkInfo li = null;
                    if (Utils.IsEmailAddress(url))
                    {
                        string linkText;
                        if (url.StartsWith("mailto:"))
                        {
                            linkText = url.Substring(7);
                        }
                        else
                        {
                            linkText = url;
                            url = "mailto:" + url;
                        }

                        li = new LinkInfo(new LinkDefinition("auto", url, null), linkText);
                    }
                    else if (Utils.IsWebAddress(url))
                    {
                        li = new LinkInfo(new LinkDefinition("auto", url, null), url);
                    }

                    if (li == null) return null;
                    SkipForward(1);
                    return CreateToken(TokenType.link, li);
                }

                this.SkipEscapableChar(extraMode);
            }

            // Didn't work
            return null;
        }

        // Process [link] and ![image] directives
        private Token ProcessLinkOrImageOrFootnote()
        {
            // Link or image?
            var tokenType = SkipChar('!') ? TokenType.img : TokenType.link;

            // Opening '['
            if (!SkipChar('['))
                return null;

            // Is it a foonote?
            var savePosition = Position;
            if (_mMarkdown.ExtraMode && tokenType == TokenType.link && SkipChar('^'))
            {
                SkipLinespace();

                // Parse it
                string id;
                if (SkipFootnoteID(out id) && SkipChar(']'))
                {
                    // Look it up and create footnote reference token
                    var footnoteIndex = _mMarkdown.ClaimFootnote(id);
                    if (footnoteIndex >= 0)
                    {
                        // Yes it's a footnote
                        return CreateToken(TokenType.footnote, new FootnoteReference(footnoteIndex, id));
                    }
                }

                // Rewind
                Position = savePosition;
            }

            if (DisableLinks && tokenType == TokenType.link)
                return null;

            var extraMode = _mMarkdown.ExtraMode;

            // Find the closing square bracket, allowing for nesting, watching for 
            // escapable characters
            Mark();
            var depth = 1;
            while (!Eof)
            {
                var ch = Current;
                if (ch == '[')
                {
                    depth++;
                }
                else if (ch == ']')
                {
                    depth--;
                    if (depth == 0)
                        break;
                }

                this.SkipEscapableChar(extraMode);
            }

            // Quit if end
            if (Eof)
                return null;

            // Get the link text and unescape it
            var linkText = Utils.UnescapeString(Extract(), extraMode);

            // The closing ']'
            SkipForward(1);

            // Save position in case we need to rewind
            savePosition = Position;

            // Inline links must follow immediately
            if (SkipChar('('))
            {
                // Extract the url and title
                var linkDef = LinkDefinition.ParseLinkTarget(this, null, _mMarkdown.ExtraMode);
                if (linkDef == null)
                    return null;

                // Closing ')'
                SkipWhitespace();
                return !SkipChar(')') ? null : CreateToken(tokenType, new LinkInfo(linkDef, linkText));

                // Create the token
            }

            // Optional space or tab
            if (!SkipChar(' '))
                SkipChar('\t');

            // If there's line end, we're allow it and as must line space as we want
            // before the link id.
            if (Eol)
            {
                SkipEol();
                SkipLinespace();
            }

            // Reference link?
            string linkID = null;
            if (Current == '[')
            {
                // Skip the opening '['
                SkipForward(1);

                // Find the start/end of the id
                Mark();
                if (!Find(']'))
                    return null;

                // Extract the id
                linkID = Extract();

                // Skip closing ']'
                SkipForward(1);
            }
            else
            {
                // Rewind to just after the closing ']'
                Position = savePosition;
            }

            // Link id not specified?
            if (string.IsNullOrEmpty(linkID))
            {
                // Use the link text (implicit reference link)
                linkID = Utils.NormalizeLineEnds(linkText);

                // If the link text has carriage returns, normalize
                // to spaces
                if (!ReferenceEquals(linkID, linkText))
                {
                    while (linkID.Contains(" \n"))
                        linkID = linkID.Replace(" \n", "\n");
                    linkID = linkID.Replace("\n", " ");
                }
            }

            // Find the link definition abort if not defined
            var def = _mMarkdown.GetLinkDefinition(linkID);
            return def == null ? null : CreateToken(tokenType, new LinkInfo(def, linkText));

            // Create a token
        }

        // Process a ``` code span ```
        private Token ProcessCodeSpan()
        {
            var start = Position;

            // Count leading ticks
            var tickcount = 0;
            while (SkipChar('`'))
            {
                tickcount++;
            }

            // Skip optional leading space...
            SkipWhitespace();

            // End?
            if (Eof)
                return CreateToken(TokenType.Text, start, Position - start);

            var startOffset = Position;

            // Find closing ticks
            if (!Find(Substring(start, tickcount)))
                return CreateToken(TokenType.Text, start, Position - start);

            // Save end position before backing up over trailing whitespace
            var position = Position + tickcount;
            while (char.IsWhiteSpace(CharAtOffset(-1)))
                SkipForward(-1);

            // Create the token, move back to the end and we're done
            var ret = CreateToken(TokenType.code_span, startOffset, Position - startOffset);
            Position = position;
            return ret;
        }


        #region Token Pooling

        // CreateToken - create or re-use a token object
        internal Token CreateToken(TokenType type, int startOffset, int length)
        {
            if (_mSpareTokens.Count != 0)
            {
                var t = _mSpareTokens.Pop();
                t.Type = type;
                t.StartOffset = startOffset;
                t.Length = length;
                t.Data = null;
                return t;
            }
            else
                return new Token(type, startOffset, length);
        }

        // CreateToken - create or re-use a token object
        internal Token CreateToken(TokenType type, object data)
        {
            if (_mSpareTokens.Count != 0)
            {
                var t = _mSpareTokens.Pop();
                t.Type = type;
                t.Data = data;
                return t;
            }
            else
                return new Token(type, data);
        }

        // FreeToken - return a token to the spare token pool
        internal void FreeToken(Token token)
        {
            token.Data = null;
            _mSpareTokens.Push(token);
        }

        private readonly Stack<Token> _mSpareTokens = new Stack<Token>();

        #endregion

        private readonly Markdown _mMarkdown;
        internal bool DisableLinks;
        private readonly List<Token> _mTokens = new List<Token>();
    }
}
