using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace MarkdownDeep
{
    /*
	 * Various utility and extension methods
	 */

    internal static class Utils
    {
        // Extension method. Get the last item in a list (or null if empty)
        public static T Last<T>(this List<T> list) where T : class
        {
            return list.Count > 0 ? list[list.Count - 1] : null;
        }

        // Extension method. Get the first item in a list (or null if empty)
        public static T First<T>(this List<T> list) where T : class
        {
            return list.Count > 0 ? list[0] : null;
        }

        // Extension method.  Use a list like a stack
        public static void Push<T>(this List<T> list, T value) where T : class
        {
            list.Add(value);
        }

        // Extension method.  Remove last item from a list
        public static T Pop<T>(this List<T> list) where T : class
        {
            if (list.Count == 0)
                return null;
            var val = list[list.Count - 1];
            list.RemoveAt(list.Count - 1);
            return val;
        }


        // Scan a string for a valid identifier.  Identifier must start with alpha or underscore
        // and can be followed by alpha, digit or underscore
        // Updates `pos` to character after the identifier if matched
        public static bool ParseIdentifier(string str, ref int pos, ref string identifier)
        {
            if (pos >= str.Length)
                return false;

            // Must start with a letter or underscore
            if (!char.IsLetter(str[pos]) && str[pos] != '_')
            {
                return false;
            }

            // Find the end
            var startIndex = pos;
            pos++;
            while (pos < str.Length && (char.IsDigit(str[pos]) || char.IsLetter(str[pos]) || str[pos] == '_'))
                pos++;

            // Return it
            identifier = str.Substring(startIndex, pos - startIndex);
            return true;
        }

        // Skip over anything that looks like a valid html entity (eg: &amp, &#123, &#nnn) etc...
        // Updates `pos` to character after the entity if matched
        public static bool SkipHtmlEntity(string str, ref int pos, ref string entity)
        {
            if (str[pos] != '&')
                return false;

            var savePosition = pos;
            var len = str.Length;
            var i = pos + 1;

            // Number entity?
            var bNumber = false;
            var bHex = false;
            if (i < len && str[i] == '#')
            {
                bNumber = true;
                i++;

                // Hex identity?
                if (i < len && (str[i] == 'x' || str[i] == 'X'))
                {
                    bHex = true;
                    i++;
                }
            }

            // Parse the content
            var contentPosition = i;
            while (i < len)
            {
                var ch = str[i];

                if (bHex)
                {
                    if (!(char.IsDigit(ch) || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F')))
                        break;
                }

                else if (bNumber)
                {
                    if (!char.IsDigit(ch))
                        break;
                }
                else if (!char.IsLetterOrDigit(ch))
                    break;

                i++;
            }

            // Quit if ran out of string
            if (i == len)
                return false;

            // Quit if nothing in the content
            if (i == contentPosition)
                return false;

            // Quit if didn't find a semicolon
            if (str[i] != ';')
                return false;

            // Looks good...
            pos = i + 1;

            entity = str.Substring(savePosition, pos - savePosition);
            return true;
        }

        // Randomize a string using html entities;
        public static void HtmlRandomize(StringBuilder dest, string str)
        {
            // Deterministic random seed
            var seed = str.Aggregate(0, (current, ch) => unchecked(current + ch));
            var r = new Random(seed);

            // Randomize
            foreach (var ch in str)
            {
                var x = r.Next() % 100;
                if (x > 90 && ch != '@')
                {
                    dest.Append(ch);
                }
                else if (x > 45)
                {
                    dest.Append("&#");
                    dest.Append(((int)ch).ToString());
                    dest.Append(";");
                }
                else
                {
                    dest.Append("&#x");
                    dest.Append(((int)ch).ToString("x"));
                    dest.Append(";");
                }

            }
        }

        // Like HtmlEncode, but don't escape &'s that look like html entities
        public static void SmartHtmlEncodeAmpsAndAngles(StringBuilder dest, string str)
        {
            if (str == null)
                return;

            for (var i = 0; i < str.Length; i++)
            {
                switch (str[i])
                {
                    case '&':
                        var start = i;
                        string unused = null;
                        if (SkipHtmlEntity(str, ref i, ref unused))
                        {
                            dest.Append(str, start, i - start);
                            i--;
                        }
                        else
                        {
                            dest.Append("&amp;");
                        }
                        break;

                    case '<':
                        dest.Append("&lt;");
                        break;

                    case '>':
                        dest.Append("&gt;");
                        break;

                    case '\"':
                        dest.Append("&quot;");
                        break;

                    default:
                        dest.Append(str[i]);
                        break;
                }
            }
        }


        // Like HtmlEncode, but only escape &'s that don't look like html entities
        public static void SmartHtmlEncodeAmps(StringBuilder dest, string str, int startOffset, int len)
        {
            var end = startOffset + len;
            for (var i = startOffset; i < end; i++)
            {
                switch (str[i])
                {
                    case '&':
                        var start = i;
                        string unused = null;
                        if (SkipHtmlEntity(str, ref i, ref unused))
                        {
                            dest.Append(str, start, i - start);
                            i--;
                        }
                        else
                        {
                            dest.Append("&amp;");
                        }
                        break;

                    default:
                        dest.Append(str[i]);
                        break;
                }
            }
        }

        // Check if a string is in an array of strings
        public static bool IsInList(string str, string[] list)
        {
            return list.Any(t => string.CompareOrdinal(t, str) == 0);
        }

        // Check if a url is "safe" (we require urls start with valid protocol)
        // Definitely don't allow "javascript:" or any of it's encodings.
        public static bool IsSafeUrl(string url)
        {
            return url.StartsWith("http://") || url.StartsWith("https://") || url.StartsWith("ftp://");
        }

        // Check if a character is escapable in markdown
        public static bool IsEscapableChar(char ch, bool extraMode)
        {
            switch (ch)
            {
                case '\\':
                case '`':
                case '*':
                case '_':
                case '{':
                case '}':
                case '[':
                case ']':
                case '(':
                case ')':
                case '>':       // Not in markdown documentation, but is in markdown.pl
                case '#':
                case '+':
                case '-':
                case '.':
                case '!':
                    return true;

                case ':':
                case '|':
                case '=':       // Added for escaping Setext H1
                case '<':
                    return extraMode;
            }

            return false;
        }

        // Extension method.  Skip an escapable character, or one normal character
        public static void SkipEscapableChar(this StringScanner p, bool extraMode)
        {
            if (p.Current == '\\' && IsEscapableChar(p.CharAtOffset(1), extraMode))
            {
                p.SkipForward(2);
            }
            else
            {
                p.SkipForward(1);
            }
        }


        // Remove the markdown escapes from a string
        public static string UnescapeString(string str, bool extraMode)
        {
            if (str == null || str.IndexOf('\\') == -1)
                return str;

            var b = new StringBuilder();
            for (var i = 0; i < str.Length; i++)
            {
                if (str[i] == '\\' && i + 1 < str.Length && IsEscapableChar(str[i + 1], extraMode))
                {
                    b.Append(str[i + 1]);
                    i++;
                }
                else
                {
                    b.Append(str[i]);
                }
            }

            return b.ToString();

        }

        // Normalize the line ends in a string to just '\n'
        // Handles all encodings - '\r\n' (windows), '\n\r' (mac), '\n' (unix) '\r' (something?)
        private static readonly char[] Lineends = { '\r', '\n' };
        public static string NormalizeLineEnds(string str)
        {
            if (str.IndexOfAny(Lineends) < 0)
                return str;

            var sb = new StringBuilder();
            var sp = new StringScanner(str);
            while (!sp.Eof)
            {
                if (sp.Eol)
                {
                    sb.Append('\n');
                    sp.SkipEol();
                }
                else
                {
                    sb.Append(sp.Current);
                    sp.SkipForward(1);
                }
            }

            return sb.ToString();
        }

        /*
		 * These two functions IsEmailAddress and IsWebAddress
		 * are intended as a quick and dirty way to tell if a 
		 * <autolink> url is email, web address or neither.
		 * 
		 * They are not intended as validating checks.
		 * 
		 * (use of Regex for more correct test unnecessarily
		 *  slowed down some test documents by up to 300%.)
		 */

        // Check if a string looks like an email address
        public static bool IsEmailAddress(string str)
        {
            var posAt = str.IndexOf('@');
            if (posAt < 0)
                return false;

            var posLastDot = str.LastIndexOf('.');
            return posLastDot >= posAt;
        }

        // Check if a string looks like a url
        public static bool IsWebAddress(string str)
        {
            return str.StartsWith("http://") ||
                    str.StartsWith("https://") ||
                    str.StartsWith("ftp://") ||
                    str.StartsWith("file://");
        }

        // Check if a string is a valid HTML ID identifier
        internal static bool IsValidHtmlID(string str)
        {
            if (string.IsNullOrEmpty(str))
                return false;

            // Must start with a letter
            return char.IsLetter(str[0]) && str.All(ch => char.IsLetterOrDigit(ch) || ch == '_' || ch == '-' || ch == ':' || ch == '.');

            // Check the rest

            // OK
        }

        // Strip the trailing HTML ID from a header string
        // ie:      ## header text ##			{#<idhere>}
        //			^start           ^out end              ^end
        //
        // Returns null if no header id
        public static string StripHtmlID(string str, int start, ref int end)
        {
            // Skip trailing whitespace
            var pos = end - 1;
            while (pos >= start && char.IsWhiteSpace(str[pos]))
            {
                pos--;
            }

            // Skip closing '{'
            if (pos < start || str[pos] != '}')
                return null;

            var endId = pos;
            pos--;

            // Find the opening '{'
            while (pos >= start && str[pos] != '{')
                pos--;

            // Check for the #
            if (pos < start || str[pos + 1] != '#')
                return null;

            // Extract and check the ID
            var startId = pos + 2;
            var strID = str.Substring(startId, endId - startId);
            if (!IsValidHtmlID(strID))
                return null;

            // Skip any preceding whitespace
            while (pos > start && char.IsWhiteSpace(str[pos - 1]))
                pos--;

            // Done!
            end = pos;
            return strID;
        }

        public static bool IsUrlFullyQualified(string url)
        {
            return url.Contains("://") || url.StartsWith("mailto:");
        }

    }
}
