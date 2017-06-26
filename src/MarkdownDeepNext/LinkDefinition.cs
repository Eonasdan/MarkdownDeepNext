using System.Text;

namespace MarkdownDeep
{
    public class LinkDefinition
    {
        public LinkDefinition(string id)
        {
            ID = id;
        }

        public LinkDefinition(string id, string url)
        {
            ID = id;
            URL = url;
        }

        public LinkDefinition(string id, string url, string title)
        {
            ID = id;
            URL = url;
            Title = title;
        }

        public string ID
        {
            get;
            set;
        }

        public string URL
        {
            get;
            set;
        }

        public string Title
        {
            get;
            set;
        }


        internal void RenderLink(Markdown m, StringBuilder b, string linkText)
        {
            if (URL.StartsWith("mailto:"))
            {
                b.Append("<a href=\"");
                Utils.HtmlRandomize(b, URL);
                b.Append('\"');
                if (!string.IsNullOrEmpty(Title))
                {
                    b.Append(" title=\"");
                    Utils.SmartHtmlEncodeAmpsAndAngles(b, Title);
                    b.Append('\"');
                }
                b.Append('>');
                Utils.HtmlRandomize(b, linkText);
                b.Append("</a>");
            }
            else
            {
                var tag = new HtmlTag("a");

                // encode url
                var sb = m.GetStringBuilder();
                Utils.SmartHtmlEncodeAmpsAndAngles(sb, URL);
                tag.Attributes["href"] = sb.ToString();

                // encode title
                if (!string.IsNullOrEmpty(Title))
                {
                    sb.Length = 0;
                    Utils.SmartHtmlEncodeAmpsAndAngles(sb, Title);
                    tag.Attributes["title"] = sb.ToString();
                }

                // Do user processing
                m.OnPrepareLink(tag);

                // Render the opening tag
                tag.RenderOpening(b);

                b.Append(linkText);      // Link text already escaped by SpanFormatter
                b.Append("</a>");
            }
        }

        internal void RenderImg(Markdown m, StringBuilder b, string altText)
        {
            var tag = new HtmlTag("img");

            // encode url
            var sb = m.GetStringBuilder();
            Utils.SmartHtmlEncodeAmpsAndAngles(sb, URL);
            tag.Attributes["src"] = sb.ToString();

            // encode alt text
            if (!string.IsNullOrEmpty(altText))
            {
                sb.Length = 0;
                Utils.SmartHtmlEncodeAmpsAndAngles(sb, altText);
                tag.Attributes["alt"] = sb.ToString();
            }

            // encode title
            if (!string.IsNullOrEmpty(Title))
            {
                sb.Length = 0;
                Utils.SmartHtmlEncodeAmpsAndAngles(sb, Title);
                tag.Attributes["title"] = sb.ToString();
            }

            tag.Closed = true;

            m.OnPrepareImage(tag, m.RenderingTitledImage);

            tag.RenderOpening(b);
        }


        // Parse a link definition from a string (used by test cases)
        internal static LinkDefinition ParseLinkDefinition(string str, bool extraMode)
        {
            var p = new StringScanner(str);
            return ParseLinkDefinitionInternal(p, extraMode);
        }

        // Parse a link definition
        internal static LinkDefinition ParseLinkDefinition(StringScanner p, bool extraMode)
        {
            var savePosition = p.Position;
            var l = ParseLinkDefinitionInternal(p, extraMode);
            if (l == null)
                p.Position = savePosition;
            return l;

        }

        internal static LinkDefinition ParseLinkDefinitionInternal(StringScanner p, bool extraMode)
        {
            // Skip leading white space
            p.SkipWhitespace();

            // Must start with an opening square bracket
            if (!p.SkipChar('['))
                return null;

            // Extract the id
            p.Mark();
            if (!p.Find(']'))
                return null;
            var id = p.Extract();
            if (id.Length == 0)
                return null;
            if (!p.SkipString("]:"))
                return null;

            // Parse the url and title
            var link = ParseLinkTarget(p, id, extraMode);

            // and trailing whitespace
            p.SkipLinespace();

            // Trailing crap, not a valid link reference...
            return !p.Eol ? null : link;
        }

        // Parse just the link target
        // For reference link definition, this is the bit after "[id]: thisbit"
        // For inline link, this is the bit in the parens: [link text](thisbit)
        internal static LinkDefinition ParseLinkTarget(StringScanner p, string id, bool extraMode)
        {
            // Skip whitespace
            p.SkipWhitespace();

            // End of string?
            if (p.Eol)
                return null;

            // Create the link definition
            var r = new LinkDefinition(id);

            // Is the url enclosed in angle brackets
            if (p.SkipChar('<'))
            {
                // Extract the url
                p.Mark();

                // Find end of the url
                while (p.Current != '>')
                {
                    if (p.Eof)
                        return null;
                    p.SkipEscapableChar(extraMode);
                }

                var url = p.Extract();
                if (!p.SkipChar('>'))
                    return null;

                // Unescape it
                r.URL = Utils.UnescapeString(url.Trim(), extraMode);

                // Skip whitespace
                p.SkipWhitespace();
            }
            else
            {
                // Find end of the url
                p.Mark();
                var parenDepth = 1;
                while (!p.Eol)
                {
                    var ch = p.Current;
                    if (char.IsWhiteSpace(ch))
                        break;
                    if (id == null)
                    {
                        if (ch == '(')
                            parenDepth++;
                        else if (ch == ')')
                        {
                            parenDepth--;
                            if (parenDepth == 0)
                                break;
                        }
                    }

                    p.SkipEscapableChar(extraMode);
                }

                r.URL = Utils.UnescapeString(p.Extract().Trim(), extraMode);
            }

            p.SkipLinespace();

            // End of inline target
            if (p.DoesMatch(')'))
                return r;

            var bOnNewLine = p.Eol;
            var posLineEnd = p.Position;
            if (p.Eol)
            {
                p.SkipEol();
                p.SkipLinespace();
            }

            // Work out what the title is delimited with
            char delimiter;
            switch (p.Current)
            {
                case '\'':
                case '\"':
                    delimiter = p.Current;
                    break;

                case '(':
                    delimiter = ')';
                    break;

                default:
                    if (!bOnNewLine) return null;
                    p.Position = posLineEnd;
                    return r;
            }

            // Skip the opening title delimiter
            p.SkipForward(1);

            // Find the end of the title
            p.Mark();
            while (true)
            {
                if (p.Eol)
                    return null;

                if (p.Current == delimiter)
                {

                    if (delimiter != ')')
                    {
                        var savePosition = p.Position;

                        // Check for embedded quotes in title

                        // Skip the quote and any trailing whitespace
                        p.SkipForward(1);
                        p.SkipLinespace();

                        // Next we expect either the end of the line for a link definition
                        // or the close bracket for an inline link
                        if ((id == null && p.Current != ')') ||
                            (id != null && !p.Eol))
                        {
                            continue;
                        }

                        p.Position = savePosition;
                    }

                    // End of title
                    break;
                }

                p.SkipEscapableChar(extraMode);
            }

            // Store the title
            r.Title = Utils.UnescapeString(p.Extract(), extraMode);

            // Skip closing quote
            p.SkipForward(1);

            // Done!
            return r;
        }
    }
}
