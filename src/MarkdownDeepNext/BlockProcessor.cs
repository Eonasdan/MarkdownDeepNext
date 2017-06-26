using System;
using System.Collections.Generic;

namespace MarkdownDeep
{
    public class BlockProcessor : StringScanner
    {
        public BlockProcessor(Markdown m, bool markdownInHtml)
        {
            _mMarkdown = m;
            _mBMarkdownInHtml = markdownInHtml;
            _mParentType = BlockType.Blank;
        }

        internal BlockProcessor(Markdown m, bool markdownInHtml, BlockType parentType)
        {
            _mMarkdown = m;
            _mBMarkdownInHtml = markdownInHtml;
            _mParentType = parentType;
        }

        internal List<Block> Process(string str)
        {
            return ScanLines(str);
        }

        internal List<Block> ScanLines(string str)
        {
            // Reset string scanner
            Reset(str);
            return ScanLines();
        }

        internal List<Block> ScanLines(string str, int start, int len)
        {
            Reset(str, start, len);
            return ScanLines();
        }

        internal bool StartTable(TableSpec spec, List<Block> lines)
        {
            // Mustn't have more than 1 preceding line
            if (lines.Count > 1)
                return false;

            // Rewind, parse the header row then fast forward back to current pos
            if (lines.Count == 1)
            {
                var savePosition = Position;
                Position = lines[0].LineStart;
                spec.Headers = spec.ParseRow(this);
                if (spec.Headers == null)
                    return false;
                Position = savePosition;
                lines.Clear();
            }

            // Parse all rows
            while (true)
            {
                var savePosition = Position;

                var row = spec.ParseRow(this);
                if (row != null)
                {
                    spec.Rows.Add(row);
                    continue;
                }

                Position = savePosition;
                break;
            }

            return true;
        }

        internal List<Block> ScanLines()
        {
            // The final set of blocks will be collected here
            var blocks = new List<Block>();

            // The current paragraph/list/codeblock etc will be accumulated here
            // before being collapsed into a block and store in above `blocks` list
            var lines = new List<Block>();

            // Add all blocks
            var unsafeHTML = BlockType.unsafe_html;
            while (!Eof)
            {
                // Remember if the previous line was blank
                var bPreviousBlank = unsafeHTML == BlockType.Blank;

                // Get the next block
                var b = EvaluateLine();
                unsafeHTML = b.BlockType;

                // For dd blocks, we need to know if it was preceded by a blank line
                // so store that fact as the block's data.
                if (b.BlockType == BlockType.dd)
                {
                    b.Data = bPreviousBlank;
                }


                // SetExt header?
                if (b.BlockType == BlockType.post_h1 || b.BlockType == BlockType.post_h2)
                {
                    if (lines.Count > 0)
                    {
                        // Remove the previous line and collapse the current paragraph
                        var previousLine = lines.Pop();
                        CollapseLines(blocks, lines);

                        // If previous line was blank, 
                        if (previousLine.BlockType != BlockType.Blank)
                        {
                            // Convert the previous line to a heading and add to block list
                            previousLine.RevertToPlain();
                            previousLine.BlockType = b.BlockType == BlockType.post_h1 ? BlockType.h1 : BlockType.h2;
                            blocks.Add(previousLine);
                            continue;
                        }
                    }

                    // Couldn't apply setext header to a previous line

                    if (b.BlockType == BlockType.post_h1)
                    {
                        // `===` gets converted to normal paragraph
                        b.RevertToPlain();
                        lines.Add(b);
                    }
                    else
                    {
                        // `---` gets converted to hr
                        if (b.ContentLen >= 3)
                        {
                            b.BlockType = BlockType.hr;
                            blocks.Add(b);
                        }
                        else
                        {
                            b.RevertToPlain();
                            lines.Add(b);
                        }
                    }

                    continue;
                }


                // Work out the current paragraph type
                var currentBlockType = lines.Count > 0 ? lines[0].BlockType : BlockType.Blank;

                // Starting a table?
                if (b.BlockType == BlockType.table_spec)
                {
                    // Get the table spec, save position
                    var spec = (TableSpec)b.Data;
                    var savePosition = Position;
                    if (!StartTable(spec, lines))
                    {
                        // Not a table, revert the tablespec row to plain,
                        // fast forward back to where we were up to and continue
                        // on as if nothing happened
                        Position = savePosition;
                        b.RevertToPlain();
                    }
                    else
                    {
                        blocks.Add(b);
                        continue;
                    }
                }

                // Process this line
                switch (b.BlockType)
                {
                    case BlockType.Blank:
                        switch (currentBlockType)
                        {
                            case BlockType.Blank:
                                FreeBlock(b);
                                break;

                            case BlockType.p:
                                CollapseLines(blocks, lines);
                                FreeBlock(b);
                                break;

                            case BlockType.quote:
                            case BlockType.ol_li:
                            case BlockType.ul_li:
                            case BlockType.dd:
                            case BlockType.footnote:
                            case BlockType.indent:
                                lines.Add(b);
                                break;

                            default:
                                System.Diagnostics.Debug.Assert(false);
                                break;
                        }
                        break;

                    case BlockType.p:
                        switch (currentBlockType)
                        {
                            case BlockType.Blank:
                            case BlockType.p:
                                lines.Add(b);
                                break;

                            case BlockType.quote:
                            case BlockType.ol_li:
                            case BlockType.ul_li:
                            case BlockType.dd:
                            case BlockType.footnote:
                                var previousline = lines.Last();
                                if (previousline.BlockType == BlockType.Blank)
                                {
                                    CollapseLines(blocks, lines);
                                    lines.Add(b);
                                }
                                else
                                {
                                    lines.Add(b);
                                }
                                break;

                            case BlockType.indent:
                                CollapseLines(blocks, lines);
                                lines.Add(b);
                                break;

                            default:
                                System.Diagnostics.Debug.Assert(false);
                                break;
                        }
                        break;

                    case BlockType.indent:
                        switch (currentBlockType)
                        {
                            case BlockType.Blank:
                                // Start a code block
                                lines.Add(b);
                                break;

                            case BlockType.p:
                            case BlockType.quote:
                                var previousLine = lines.Last();
                                if (previousLine.BlockType == BlockType.Blank)
                                {
                                    // Start a code block after a paragraph
                                    CollapseLines(blocks, lines);
                                    lines.Add(b);
                                }
                                else
                                {
                                    // indented line in paragraph, just continue it
                                    b.RevertToPlain();
                                    lines.Add(b);
                                }
                                break;


                            case BlockType.ol_li:
                            case BlockType.ul_li:
                            case BlockType.dd:
                            case BlockType.footnote:
                            case BlockType.indent:
                                lines.Add(b);
                                break;

                            default:
                                System.Diagnostics.Debug.Assert(false);
                                break;
                        }
                        break;

                    case BlockType.quote:
                        if (currentBlockType != BlockType.quote)
                        {
                            CollapseLines(blocks, lines);
                        }
                        lines.Add(b);
                        break;

                    case BlockType.ol_li:
                    case BlockType.ul_li:
                        switch (currentBlockType)
                        {
                            case BlockType.Blank:
                                lines.Add(b);
                                break;

                            case BlockType.p:
                            case BlockType.quote:
                                var previousLine = lines.Last();
                                if (previousLine.BlockType == BlockType.Blank || _mParentType == BlockType.ol_li || _mParentType == BlockType.ul_li || _mParentType == BlockType.dd)
                                {
                                    // List starting after blank line after paragraph or quote
                                    CollapseLines(blocks, lines);
                                    lines.Add(b);
                                }
                                else
                                {
                                    // List's can't start in middle of a paragraph
                                    b.RevertToPlain();
                                    lines.Add(b);
                                }
                                break;

                            case BlockType.ol_li:
                            case BlockType.ul_li:
                                if (b.BlockType != BlockType.ol_li && b.BlockType != BlockType.ul_li)
                                {
                                    CollapseLines(blocks, lines);
                                }
                                lines.Add(b);
                                break;

                            case BlockType.dd:
                            case BlockType.footnote:
                                if (b.BlockType != currentBlockType)
                                {
                                    CollapseLines(blocks, lines);
                                }
                                lines.Add(b);
                                break;

                            case BlockType.indent:
                                // List after code block
                                CollapseLines(blocks, lines);
                                lines.Add(b);
                                break;
                        }
                        break;

                    case BlockType.dd:
                    case BlockType.footnote:
                        switch (currentBlockType)
                        {
                            case BlockType.Blank:
                            case BlockType.p:
                            case BlockType.dd:
                            case BlockType.footnote:
                                CollapseLines(blocks, lines);
                                lines.Add(b);
                                break;

                            default:
                                b.RevertToPlain();
                                lines.Add(b);
                                break;
                        }
                        break;

                    default:
                        CollapseLines(blocks, lines);
                        blocks.Add(b);
                        break;
                }
            }

            CollapseLines(blocks, lines);

            if (_mMarkdown.ExtraMode)
            {
                BuildDefinitionLists(blocks);
            }

            return blocks;
        }

        internal Block CreateBlock()
        {
            return _mMarkdown.CreateBlock();
        }

        internal void FreeBlock(Block b)
        {
            _mMarkdown.FreeBlock(b);
        }

        internal void FreeBlocks(List<Block> blocks)
        {
            foreach (var b in blocks)
                FreeBlock(b);
            blocks.Clear();
        }

        internal string RenderLines(List<Block> lines)
        {
            var b = _mMarkdown.GetStringBuilder();
            foreach (var l in lines)
            {
                b.Append(l.Buf, l.ContentStart, l.ContentLen);
                b.Append('\n');
            }
            return b.ToString();
        }

        internal void CollapseLines(List<Block> blocks, List<Block> lines)
        {
            // Remove trailing blank lines
            while (lines.Count > 0 && lines.Last().BlockType == BlockType.Blank)
            {
                FreeBlock(lines.Pop());
            }

            // Quit if empty
            if (lines.Count == 0)
            {
                return;
            }


            // What sort of block?
            switch (lines[0].BlockType)
            {
                case BlockType.p:
                    {
                        // Collapse all lines into a single paragraph
                        var para = CreateBlock();
                        para.BlockType = BlockType.p;
                        para.Buf = lines[0].Buf;
                        para.ContentStart = lines[0].ContentStart;
                        para.ContentEnd = lines.Last().ContentEnd;
                        blocks.Add(para);
                        FreeBlocks(lines);
                        break;
                    }

                case BlockType.quote:
                    {
                        // Create a new quote block
                        var quote = new Block(BlockType.quote)
                        {
                            Children =
                                new BlockProcessor(_mMarkdown, _mBMarkdownInHtml, BlockType.quote).Process(
                                    RenderLines(lines))
                        };
                        FreeBlocks(lines);
                        blocks.Add(quote);
                        break;
                    }

                case BlockType.ol_li:
                case BlockType.ul_li:
                    blocks.Add(BuildList(lines));
                    break;

                case BlockType.dd:
                    if (blocks.Count > 0)
                    {
                        var block = blocks[blocks.Count - 1];
                        switch (block.BlockType)
                        {
                            case BlockType.p:
                                block.BlockType = BlockType.dt;
                                break;

                            case BlockType.dd:
                                break;

                            default:
                                var wrapper = CreateBlock();
                                wrapper.BlockType = BlockType.dt;
                                wrapper.Children = new List<Block> { block };
                                blocks.Pop();
                                blocks.Add(wrapper);
                                break;
                        }

                    }
                    blocks.Add(BuildDefinition(lines));
                    break;

                case BlockType.footnote:
                    _mMarkdown.AddFootnote(BuildFootnote(lines));
                    break;

                case BlockType.indent:
                    {
                        var codeblock = new Block(BlockType.codeblock) { Children = new List<Block>() };
                        codeblock.Children.AddRange(lines);
                        blocks.Add(codeblock);
                        lines.Clear();
                        break;
                    }
            }
        }


        private Block EvaluateLine()
        {
            // Create a block
            var b = CreateBlock();

            // Store line start
            b.LineStart = Position;
            b.Buf = Input;

            // Scan the line
            b.ContentStart = Position;
            b.ContentLen = -1;
            b.BlockType = EvaluateLine(b);

            // If end of line not returned, do it automatically
            if (b.ContentLen < 0)
            {
                // Move to end of line
                SkipToEol();
                b.ContentLen = Position - b.ContentStart;
            }

            // Setup line length
            b.LineLen = Position - b.LineStart;

            // Next line
            SkipEol();

            // Create block
            return b;
        }

        private BlockType EvaluateLine(Block b)
        {
            // Empty line?
            if (Eol)
                return BlockType.Blank;

            // Save start of line position
            var lineStart = Position;

            // ## Heading ##		
            var ch = Current;
            if (ch == '#')
            {
                // Work out heading level
                var level = 1;
                SkipForward(1);
                while (Current == '#')
                {
                    level++;
                    SkipForward(1);
                }

                // Limit of 6
                if (level > 6)
                    level = 6;

                // Skip any whitespace
                SkipLinespace();

                // Save start position
                b.ContentStart = Position;

                // Jump to end
                SkipToEol();

                // In extra mode, check for a trailing HTML ID
                if (_mMarkdown.ExtraMode && !_mMarkdown.SafeMode)
                {
                    var end = Position;
                    var strID = Utils.StripHtmlID(Input, b.ContentStart, ref end);
                    if (strID != null)
                    {
                        b.Data = strID;
                        Position = end;
                    }
                }

                // Rewind over trailing hashes
                while (Position > b.ContentStart && CharAtOffset(-1) == '#')
                {
                    SkipForward(-1);
                }

                // Rewind over trailing spaces
                while (Position > b.ContentStart && char.IsWhiteSpace(CharAtOffset(-1)))
                {
                    SkipForward(-1);
                }

                // Create the heading block
                b.ContentEnd = Position;

                SkipToEol();
                return BlockType.h1 + (level - 1);
            }

            // Check for entire line as - or = for setext h1 and h2
            if (ch == '-' || ch == '=')
            {
                // Skip all matching characters
                var chType = ch;
                while (Current == chType)
                {
                    SkipForward(1);
                }

                // Trailing whitespace allowed
                SkipLinespace();

                // If not at eol, must have found something other than setext header
                if (Eol)
                {
                    return chType == '=' ? BlockType.post_h1 : BlockType.post_h2;
                }

                Position = lineStart;
            }

            // MarkdownExtra Table row indicator?
            if (_mMarkdown.ExtraMode)
            {
                var spec = TableSpec.Parse(this);
                if (spec != null)
                {
                    b.Data = spec;
                    return BlockType.table_spec;
                }

                Position = lineStart;
            }

            // Fenced code blocks?
            if (_mMarkdown.ExtraMode && (ch == '~' || ch == '`'))
            {
                if (ProcessFencedCodeBlock(b))
                    return b.BlockType;

                // Rewind
                Position = lineStart;
            }

            // Scan the leading whitespace, remembering how many spaces and where the first tab is
            var tabPos = -1;
            var leadingSpaces = 0;
            while (!Eol)
            {
                if (Current == ' ')
                {
                    if (tabPos < 0)
                        leadingSpaces++;
                }
                else if (Current == '\t')
                {
                    if (tabPos < 0)
                        tabPos = Position;
                }
                else
                {
                    // Something else, get out
                    break;
                }
                SkipForward(1);
            }

            // Blank line?
            if (Eol)
            {
                b.ContentEnd = b.ContentStart;
                return BlockType.Blank;
            }

            // 4 leading spaces?
            if (leadingSpaces >= 4)
            {
                b.ContentStart = lineStart + 4;
                return BlockType.indent;
            }

            // Tab in the first 4 characters?
            if (tabPos >= 0 && tabPos - lineStart < 4)
            {
                b.ContentStart = tabPos + 1;
                return BlockType.indent;
            }

            // Treat start of line as after leading whitespace
            b.ContentStart = Position;

            // Get the next character
            ch = Current;

            // Html block?
            if (ch == '<')
            {
                // Scan html block
                if (ScanHtml(b))
                    return b.BlockType;

                // Rewind
                Position = b.ContentStart;
            }

            // Block quotes start with '>' and have one space or one tab following
            if (ch == '>')
            {
                // Block quote followed by space
                if (IsLineSpace(CharAtOffset(1)))
                {
                    // Skip it and create quote block
                    SkipForward(2);
                    b.ContentStart = Position;
                    return BlockType.quote;
                }

                SkipForward(1);
                b.ContentStart = Position;
                return BlockType.quote;
            }

            // Horizontal rule - a line consisting of 3 or more '-', '_' or '*' with optional spaces and nothing else
            if (ch == '-' || ch == '_' || ch == '*')
            {
                var count = 0;
                while (!Eol)
                {
                    if (Current == ch)
                    {
                        count++;
                        SkipForward(1);
                        continue;
                    }

                    if (IsLineSpace(Current))
                    {
                        SkipForward(1);
                        continue;
                    }

                    break;
                }

                if (Eol && count >= 3)
                {
                    return _mMarkdown.UserBreaks ? BlockType.user_break : BlockType.hr;
                }

                // Rewind
                Position = b.ContentStart;
            }

            // Abbreviation definition?
            if (_mMarkdown.ExtraMode && ch == '*' && CharAtOffset(1) == '[')
            {
                SkipForward(2);
                SkipLinespace();

                Mark();
                while (!Eol && Current != ']')
                {
                    SkipForward(1);
                }

                var abbr = Extract().Trim();
                if (Current == ']' && CharAtOffset(1) == ':' && !string.IsNullOrEmpty(abbr))
                {
                    SkipForward(2);
                    SkipLinespace();

                    Mark();

                    SkipToEol();

                    var title = Extract();

                    _mMarkdown.AddAbbreviation(abbr, title);

                    return BlockType.Blank;
                }

                Position = b.ContentStart;
            }

            // Unordered list
            if ((ch == '*' || ch == '+' || ch == '-') && IsLineSpace(CharAtOffset(1)))
            {
                // Skip it
                SkipForward(1);
                SkipLinespace();
                b.ContentStart = Position;
                return BlockType.ul_li;
            }

            // Definition
            if (ch == ':' && _mMarkdown.ExtraMode && IsLineSpace(CharAtOffset(1)))
            {
                SkipForward(1);
                SkipLinespace();
                b.ContentStart = Position;
                return BlockType.dd;
            }

            // Ordered list
            if (char.IsDigit(ch))
            {
                // Ordered list?  A line starting with one or more digits, followed by a '.' and a space or tab

                // Skip all digits
                SkipForward(1);
                while (char.IsDigit(Current))
                    SkipForward(1);

                if (SkipChar('.') && SkipLinespace())
                {
                    b.ContentStart = Position;
                    return BlockType.ol_li;
                }

                Position = b.ContentStart;
            }

            // Reference link definition?
            if (ch != '[') return BlockType.p;
            // Footnote definition?
            if (_mMarkdown.ExtraMode && CharAtOffset(1) == '^')
            {
                var savePosition = Position;

                SkipForward(2);

                string id;
                if (SkipFootnoteID(out id) && SkipChar(']') && SkipChar(':'))
                {
                    SkipLinespace();
                    b.ContentStart = Position;
                    b.Data = id;
                    return BlockType.footnote;
                }

                Position = savePosition;
            }

            // Parse a link definition
            var l = LinkDefinition.ParseLinkDefinition(this, _mMarkdown.ExtraMode);
            if (l == null) return BlockType.p;
            _mMarkdown.AddLinkDefinition(l);
            return BlockType.Blank;

            // Nothing special
        }

        internal enum MarkdownInHtmlMode
        {
            NA,         // No markdown attribute on the tag
            Block,      // markdown=1 or markdown=block
            Span,       // markdown=1 or markdown=span
            Deep,       // markdown=deep - recursive block mode
            Off,        // Markdown="something else"
        }

        internal MarkdownInHtmlMode GetMarkdownMode(HtmlTag tag)
        {
            // Get the markdown attribute
            string strMarkdownMode;
            if (!_mMarkdown.ExtraMode || !tag.Attributes.TryGetValue("markdown", out strMarkdownMode))
            {
                return _mBMarkdownInHtml ? MarkdownInHtmlMode.Deep : MarkdownInHtmlMode.NA;
            }

            // Remove it
            tag.Attributes.Remove("markdown");

            // Parse mode
            switch (strMarkdownMode)
            {
                case "1":
                    return (tag.Flags & HtmlTagFlags.ContentAsSpan) != 0 ? MarkdownInHtmlMode.Span : MarkdownInHtmlMode.Block;
                case "block":
                    return MarkdownInHtmlMode.Block;
                case "deep":
                    return MarkdownInHtmlMode.Deep;
                case "span":
                    return MarkdownInHtmlMode.Span;
            }

            return MarkdownInHtmlMode.Off;
        }

        internal bool ProcessMarkdownEnabledHtml(Block b, HtmlTag openingTag, MarkdownInHtmlMode mode)
        {
            // Current position is just after the opening tag

            // Scan until we find matching closing tag
            var innerPos = Position;
            var depth = 1;
            var bHasUnsafeContent = false;
            while (!Eof)
            {
                // Find next angle bracket
                if (!Find('<'))
                    break;

                // Is it a html tag?
                var position = Position;
                var tag = HtmlTag.Parse(this);
                if (tag == null)
                {
                    // Nope, skip it 
                    SkipForward(1);
                    continue;
                }

                // In markdown off mode, we need to check for unsafe tags
                if (_mMarkdown.SafeMode && mode == MarkdownInHtmlMode.Off && !bHasUnsafeContent)
                {
                    if (!tag.IsSafe())
                        bHasUnsafeContent = true;
                }

                // Ignore self closing tags
                if (tag.Closed)
                    continue;

                // Same tag?
                if (tag.Name != openingTag.Name) continue;
                if (tag.Closing)
                {
                    depth--;
                    if (depth != 0) continue;
                    // End of tag?
                    SkipLinespace();
                    SkipEol();

                    b.BlockType = BlockType.HtmlTag;
                    b.Data = openingTag;
                    b.ContentEnd = Position;

                    switch (mode)
                    {
                        case MarkdownInHtmlMode.Span:
                            {
                                var span = CreateBlock();
                                span.Buf = Input;
                                span.BlockType = BlockType.span;
                                span.ContentStart = innerPos;
                                span.ContentLen = position - innerPos;

                                b.Children = new List<Block> { span };
                                break;
                            }

                        case MarkdownInHtmlMode.Block:
                        case MarkdownInHtmlMode.Deep:
                            {
                                // Scan the internal content
                                var bp = new BlockProcessor(_mMarkdown, mode == MarkdownInHtmlMode.Deep);
                                b.Children = bp.ScanLines(Input, innerPos, position - innerPos);
                                break;
                            }

                        case MarkdownInHtmlMode.Off:
                            {
                                if (bHasUnsafeContent)
                                {
                                    b.BlockType = BlockType.unsafe_html;
                                    b.ContentEnd = Position;
                                }
                                else
                                {
                                    var span = CreateBlock();
                                    span.Buf = Input;
                                    span.BlockType = BlockType.html;
                                    span.ContentStart = innerPos;
                                    span.ContentLen = position - innerPos;

                                    b.Children = new List<Block> { span };
                                }
                                break;
                            }
                    }


                    return true;
                }
                depth++;
            }

            // Missing closing tag(s).  
            return false;
        }

        // Scan from the current position to the end of the html section
        internal bool ScanHtml(Block b)
        {
            // Remember start of html
            var posStartPiece = Position;

            // Parse a HTML tag
            var openingTag = HtmlTag.Parse(this);
            if (openingTag == null)
                return false;

            // Closing tag?
            if (openingTag.Closing)
                return false;

            // Safe mode?
            var bHasUnsafeContent = _mMarkdown.SafeMode && !openingTag.IsSafe();

            var flags = openingTag.Flags;

            // Is it a block level tag?
            if ((flags & HtmlTagFlags.Block) == 0)
                return false;

            // Closed tag, hr or comment?
            if ((flags & HtmlTagFlags.NoClosing) != 0 || openingTag.Closed)
            {
                SkipLinespace();
                SkipEol();

                b.ContentEnd = Position;
                b.BlockType = bHasUnsafeContent ? BlockType.unsafe_html : BlockType.html;
                return true;
            }

            // Can it also be an inline tag?
            if ((flags & HtmlTagFlags.Inline) != 0)
            {
                // Yes, opening tag must be on a line by itself
                SkipLinespace();
                if (!Eol)
                    return false;
            }

            // Head block extraction?
            var bHeadBlock = _mMarkdown.ExtractHeadBlocks && string.Compare(openingTag.Name, "head", StringComparison.OrdinalIgnoreCase) == 0;
            var headStart = Position;

            // Work out the markdown mode for this element
            if (!bHeadBlock && _mMarkdown.ExtraMode)
            {
                var markdownMode = GetMarkdownMode(openingTag);
                if (markdownMode != MarkdownInHtmlMode.NA)
                {
                    return ProcessMarkdownEnabledHtml(b, openingTag, markdownMode);
                }
            }

            List<Block> childBlocks = null;

            // Now capture everything up to the closing tag and put it all in a single HTML block
            var depth = 1;

            while (!Eof)
            {
                // Find next angle bracket
                if (!Find('<'))
                    break;

                // Save position of current tag
                var posStartCurrentTag = Position;

                // Is it a html tag?
                var tag = HtmlTag.Parse(this);
                if (tag == null)
                {
                    // Nope, skip it 
                    SkipForward(1);
                    continue;
                }

                // Safe mode checks
                if (_mMarkdown.SafeMode && !tag.IsSafe())
                    bHasUnsafeContent = true;

                // Ignore self closing tags
                if (tag.Closed)
                    continue;

                // Markdown enabled content?
                if (!bHeadBlock && !tag.Closing && _mMarkdown.ExtraMode && !bHasUnsafeContent)
                {
                    var markdownMode = GetMarkdownMode(tag);
                    if (markdownMode != MarkdownInHtmlMode.NA)
                    {
                        var markdownBlock = CreateBlock();
                        if (ProcessMarkdownEnabledHtml(markdownBlock, tag, markdownMode))
                        {
                            if (childBlocks == null)
                            {
                                childBlocks = new List<Block>();
                            }

                            // Create a block for everything before the markdown tag
                            if (posStartCurrentTag > posStartPiece)
                            {
                                var htmlBlock = CreateBlock();
                                htmlBlock.Buf = Input;
                                htmlBlock.BlockType = BlockType.html;
                                htmlBlock.ContentStart = posStartPiece;
                                htmlBlock.ContentLen = posStartCurrentTag - posStartPiece;

                                childBlocks.Add(htmlBlock);
                            }

                            // Add the markdown enabled child block
                            childBlocks.Add(markdownBlock);

                            // Remember start of the next piece
                            posStartPiece = Position;

                            continue;
                        }
                        FreeBlock(markdownBlock);
                    }
                }

                // Same tag?
                if (tag.Name != openingTag.Name) continue;

                if (tag.Closing)
                {
                    depth--;
                    if (depth != 0) continue;
                    // End of tag?
                    SkipLinespace();
                    SkipEol();

                    // If anything unsafe detected, just encode the whole block
                    if (bHasUnsafeContent)
                    {
                        b.BlockType = BlockType.unsafe_html;
                        b.ContentEnd = Position;
                        return true;
                    }

                    // Did we create any child blocks
                    if (childBlocks != null)
                    {
                        // Create a block for the remainder
                        if (Position > posStartPiece)
                        {
                            var htmlBlock = CreateBlock();
                            htmlBlock.Buf = Input;
                            htmlBlock.BlockType = BlockType.html;
                            htmlBlock.ContentStart = posStartPiece;
                            htmlBlock.ContentLen = Position - posStartPiece;

                            childBlocks.Add(htmlBlock);
                        }

                        // Return a composite block
                        b.BlockType = BlockType.Composite;
                        b.ContentEnd = Position;
                        b.Children = childBlocks;
                        return true;
                    }

                    // Extract the head block content
                    if (bHeadBlock)
                    {
                        var content = Substring(headStart, posStartCurrentTag - headStart);
                        _mMarkdown.HeadBlockContent = (_mMarkdown.HeadBlockContent ?? "") + content.Trim() + "\n";
                        b.BlockType = BlockType.html;
                        b.ContentStart = Position;
                        b.ContentEnd = Position;
                        b.LineStart = Position;
                        return true;
                    }

                    // Straight html block
                    b.BlockType = BlockType.html;
                    b.ContentEnd = Position;
                    return true;
                }
                depth++;
            }

            // Rewind to just after the tag
            return false;
        }

        /*
		 * Spacing
		 * 
		 * 1-3 spaces - Promote to indented if more spaces than original item
		 * 
		 */

        /* 
		 * BuildList - build a single <ol> or <ul> list
		 */
        private Block BuildList(List<Block> lines)
        {
            // What sort of list are we dealing with
            var listType = lines[0].BlockType;
            System.Diagnostics.Debug.Assert(listType == BlockType.ul_li || listType == BlockType.ol_li);

            // Preprocess
            // 1. Collapse all plain lines (ie: handle hardwrapped lines)
            // 2. Promote any unindented lines that have more leading space 
            //    than the original list item to indented, including leading 
            //    special chars
            var leadingSpace = lines[0].LeadingSpaces;
            for (var i = 1; i < lines.Count; i++)
            {
                // Join plain paragraphs
                if ((lines[i].BlockType == BlockType.p) &&
                    (lines[i - 1].BlockType == BlockType.p || lines[i - 1].BlockType == BlockType.ul_li || lines[i - 1].BlockType == BlockType.ol_li))
                {
                    lines[i - 1].ContentEnd = lines[i].ContentEnd;
                    FreeBlock(lines[i]);
                    lines.RemoveAt(i);
                    i--;
                    continue;
                }

                if (lines[i].BlockType == BlockType.indent || lines[i].BlockType == BlockType.Blank) continue;
                var thisLeadingSpace = lines[i].LeadingSpaces;
                if (thisLeadingSpace <= leadingSpace) continue;
                // Change line to indented, including original leading chars 
                // (eg: '* ', '>', '1.' etc...)
                lines[i].BlockType = BlockType.indent;
                var saveend = lines[i].ContentEnd;
                lines[i].ContentStart = lines[i].LineStart + thisLeadingSpace;
                lines[i].ContentEnd = saveend;
            }


            // Create the wrapping list item
            var list = new Block(listType == BlockType.ul_li ? BlockType.ul : BlockType.ol)
            {
                Children = new List<Block>()
            };

            // Process all lines in the range		
            for (var i = 0; i < lines.Count; i++)
            {
                System.Diagnostics.Debug.Assert(lines[i].BlockType == BlockType.ul_li || lines[i].BlockType == BlockType.ol_li);

                // Find start of item, including leading blanks
                var startOfLi = i;
                while (startOfLi > 0 && lines[startOfLi - 1].BlockType == BlockType.Blank)
                    startOfLi--;

                // Find end of the item, including trailing blanks
                var endOfLi = i;
                while (endOfLi < lines.Count - 1 && lines[endOfLi + 1].BlockType != BlockType.ul_li && lines[endOfLi + 1].BlockType != BlockType.ol_li)
                    endOfLi++;

                // Is this a simple or complex list item?
                if (startOfLi == endOfLi)
                {
                    // It's a simple, single line item item
                    System.Diagnostics.Debug.Assert(startOfLi == i);
                    list.Children.Add(CreateBlock().CopyFrom(lines[i]));
                }
                else
                {
                    // Build a new string containing all child items
                    var bAnyBlanks = false;
                    var sb = _mMarkdown.GetStringBuilder();
                    for (var j = startOfLi; j <= endOfLi; j++)
                    {
                        var l = lines[j];
                        sb.Append(l.Buf, l.ContentStart, l.ContentLen);
                        sb.Append('\n');

                        if (lines[j].BlockType == BlockType.Blank)
                        {
                            bAnyBlanks = true;
                        }
                    }

                    // Create the item and process child blocks
                    var item = new Block(BlockType.li)
                    {
                        Children = new BlockProcessor(_mMarkdown, _mBMarkdownInHtml, listType).Process(sb.ToString())
                    };

                    // If no blank lines, change all contained paragraphs to plain text
                    if (!bAnyBlanks)
                    {
                        foreach (var child in item.Children)
                        {
                            if (child.BlockType == BlockType.p)
                            {
                                child.BlockType = BlockType.span;
                            }
                        }
                    }

                    // Add the complex item
                    list.Children.Add(item);
                }

                // Continue processing from end of li
                i = endOfLi;
            }

            FreeBlocks(lines);
            lines.Clear();

            // Continue processing after this item
            return list;
        }

        /* 
		 * BuildDefinition - build a single <dd> item
		 */
        private Block BuildDefinition(List<Block> lines)
        {
            // Collapse all plain lines (ie: handle hardwrapped lines)
            for (var i = 1; i < lines.Count; i++)
            {
                // Join plain paragraphs
                if ((lines[i].BlockType != BlockType.p) ||
                    (lines[i - 1].BlockType != BlockType.p && lines[i - 1].BlockType != BlockType.dd)) continue;
                lines[i - 1].ContentEnd = lines[i].ContentEnd;
                FreeBlock(lines[i]);
                lines.RemoveAt(i);
                i--;
            }

            // Single line definition
            var precededByBlank = (bool)lines[0].Data;
            if (lines.Count == 1 && !precededByBlank)
            {
                var ret = lines[0];
                lines.Clear();
                return ret;
            }

            // Build a new string containing all child items
            var sb = _mMarkdown.GetStringBuilder();
            foreach (var l in lines)
            {
                sb.Append(l.Buf, l.ContentStart, l.ContentLen);
                sb.Append('\n');
            }

            // Create the item and process child blocks
            var item = CreateBlock();
            item.BlockType = BlockType.dd;
            item.Children = new BlockProcessor(_mMarkdown, _mBMarkdownInHtml, BlockType.dd).Process(sb.ToString());

            FreeBlocks(lines);
            lines.Clear();

            // Continue processing after this item
            return item;
        }

        private void BuildDefinitionLists(List<Block> blocks)
        {
            Block currentList = null;
            for (var i = 0; i < blocks.Count; i++)
            {
                switch (blocks[i].BlockType)
                {
                    case BlockType.dt:
                    case BlockType.dd:
                        if (currentList == null)
                        {
                            currentList = CreateBlock();
                            currentList.BlockType = BlockType.dl;
                            currentList.Children = new List<Block>();
                            blocks.Insert(i, currentList);
                            i++;
                        }

                        currentList.Children.Add(blocks[i]);
                        blocks.RemoveAt(i);
                        i--;
                        break;

                    default:
                        currentList = null;
                        break;
                }
            }
        }

        private Block BuildFootnote(List<Block> lines)
        {
            // Collapse all plain lines (ie: handle hardwrapped lines)
            for (var i = 1; i < lines.Count; i++)
            {
                // Join plain paragraphs
                if ((lines[i].BlockType != BlockType.p) ||
                    (lines[i - 1].BlockType != BlockType.p && lines[i - 1].BlockType != BlockType.footnote)) continue;
                lines[i - 1].ContentEnd = lines[i].ContentEnd;
                FreeBlock(lines[i]);
                lines.RemoveAt(i);
                i--;
            }

            // Build a new string containing all child items
            var sb = _mMarkdown.GetStringBuilder();
            foreach (var l in lines)
            {
                sb.Append(l.Buf, l.ContentStart, l.ContentLen);
                sb.Append('\n');
            }

            // Create the item and process child blocks
            var item = CreateBlock();
            item.BlockType = BlockType.footnote;
            item.Data = lines[0].Data;
            item.Children = new BlockProcessor(_mMarkdown, _mBMarkdownInHtml, BlockType.footnote).Process(sb.ToString());

            FreeBlocks(lines);
            lines.Clear();

            // Continue processing after this item
            return item;
        }

        private bool ProcessFencedCodeBlock(Block b)
        {
            var delimiter = Current;

            // Extract the fence
            Mark();
            while (Current == delimiter)
                SkipForward(1);
            var strFence = Extract();

            // Must be at least 3 long
            if (strFence.Length < 3)
                return false;

            // Rest of line must be blank
            SkipLinespace();
            if (!Eol)
                return false;

            // Skip the eol and remember start of code
            SkipEol();
            var startCode = Position;

            // Find the end fence
            if (!Find(strFence))
                return false;

            // Character before must be a eol char
            if (!IsLineEnd(CharAtOffset(-1)))
                return false;

            var endCode = Position;

            // Skip the fence
            SkipForward(strFence.Length);

            // Whitespace allowed at end
            SkipLinespace();
            if (!Eol)
                return false;

            // Create the code block
            b.BlockType = BlockType.codeblock;
            b.Children = new List<Block>();

            // Remove the trailing line end
            if (Input[endCode - 1] == '\r' && Input[endCode - 2] == '\n')
                endCode -= 2;
            else if (Input[endCode - 1] == '\n' && Input[endCode - 2] == '\r')
                endCode -= 2;
            else
                endCode--;

            // Create the child block with the entire content
            var child = CreateBlock();
            child.BlockType = BlockType.indent;
            child.Buf = Input;
            child.ContentStart = startCode;
            child.ContentEnd = endCode;
            b.Children.Add(child);

            return true;
        }

        private readonly Markdown _mMarkdown;
        private readonly BlockType _mParentType;
        private readonly bool _mBMarkdownInHtml;
    }
}
