namespace MarkdownDeep
{
    /*
	 * Token is used to mark out various special parts of a string being
	 * formatted by SpanFormatter.
	 * 
	 * Strings aren't actually stored in the token - just their offset
	 * and length in the input string.
	 * 
	 * For performance, Token's are pooled and reused.  
	 * See SpanFormatter.CreateToken()
	 */

    // TokenType - what sort of token?
    // ReSharper disable InconsistentNaming
    internal enum TokenType
    {
        Text,           // Plain text, should be htmlencoded
        HtmlTag,        // Valid html tag, write out directly but escape &amps;
        Html,           // Valid html, write out directly
        
        open_em,        // <em>
        close_em,       // </em>
        open_strong,    // <strong>
        close_strong,   // </strong>
        code_span,      // <code></code>
        br,             // <br />

        link,           // <a href>, data = LinkInfo
        img,            // <img>, data = LinkInfo
        footnote,       // Footnote reference
        abbreviation,   // An abbreviation, data is a reference to abbreviation instance

        // These are used during construction of <em> and <strong> tokens
        opening_mark,   // opening '*' or '_'
        closing_mark,   // closing '*' or '_'
        internal_mark,  // internal '*' or '_'
    }
    // ReSharper restore InconsistentNaming

    // Token
    internal class Token
    {
        // Constructor
        public Token(TokenType type, int startOffset, int length)
        {
            Type = type;
            StartOffset = startOffset;
            Length = length;
        }

        // Constructor
        public Token(TokenType type, object data)
        {
            Type = type;
            Data = data;
        }

        public override string ToString()
        {
            return $"{Type} - {StartOffset} - {Length}";
        }

        public TokenType Type;
        public int StartOffset;
        public int Length;
        public object Data;
    }

}
