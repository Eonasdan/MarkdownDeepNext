using System;
using System.Linq;

namespace MarkdownDeep
{
    /*
	 * StringScanner is a simple class to help scan through an input string.
	 * 
	 * Maintains a current position with various operations to inspect the current
	 * character, skip forward, check for matches, skip whitespace etc...
	 */
    public class StringScanner
    {
        // Constructor
        public StringScanner()
        {
        }

        // Constructor
        public StringScanner(string str)
        {
            Reset(str);
        }

        // Constructor
        public StringScanner(string str, int pos)
        {
            Reset(str, pos);
        }

        // Constructor
        public StringScanner(string str, int pos, int len)
        {
            Reset(str, pos, len);
        }

        // Reset
        public void Reset(string str)
        {
            Reset(str, 0, str?.Length ?? 0);
        }

        // Reset
        public void Reset(string str, int pos)
        {
            Reset(str, pos, str?.Length - pos ?? 0);
        }

        // Reset
        public void Reset(string str, int pos, int len)
        {
            if (str == null)
                str = "";
            if (len < 0)
                len = 0;
            if (pos < 0)
                pos = 0;
            if (pos > str.Length)
                pos = str.Length;

            Input = str;
            _start = pos;
            _pos = pos;
            _end = pos + len;

            if (_end > str.Length)
                _end = str.Length;
        }

        // Get the entire input string
        public string Input { get; private set; }

        // Get the character at the current position
        public char Current
        {
            get
            {
                if (_pos < _start || _pos >= _end)
                    return '\0';
                return Input[_pos];
            }
        }

        // Get/set the current position
        public int Position
        {
            get
            {
                return _pos;
            }
            set
            {
                _pos = value;
            }
        }

        // Get the remainder of the input 
        // (use this in a watch window while debugging :)
        public string Remainder => Substring(Position);

        // Skip to the end of file
        public void SkipToEof()
        {
            _pos = _end;
        }


        // Skip to the end of the current line
        public void SkipToEol()
        {
            while (_pos < _end)
            {
                var ch = Input[_pos];
                if (ch == '\r' || ch == '\n')
                    break;
                _pos++;
            }
        }

        // Skip if currently at a line end
        public bool SkipEol()
        {
            if (_pos >= _end) return false;
            var ch = Input[_pos];
            if (ch == '\r')
            {
                _pos++;
                if (_pos < _end && Input[_pos] == '\n')
                    _pos++;
                return true;
            }

            if (ch != '\n') return false;

            _pos++;
            if (_pos < _end && Input[_pos] == '\r')
                _pos++;
            return true;
        }

        // Skip to the next line
        public void SkipToNextLine()
        {
            SkipToEol();
            SkipEol();
        }

        // Get the character at offset from current position
        // Or, \0 if out of range
        public char CharAtOffset(int offset)
        {
            var index = _pos + offset;

            if (index < _start)
                return '\0';
            return index >= _end ? '\0' : Input[index];
        }

        // Skip a number of characters
        public void SkipForward(int characters)
        {
            _pos += characters;
        }

        // Skip a character if present
        public bool SkipChar(char ch)
        {
            if (Current != ch) return false;
            SkipForward(1);
            return true;
        }

        // Skip a matching string
        public bool SkipString(string str)
        {
            if (!DoesMatch(str)) return false;
            SkipForward(str.Length);
            return true;
        }

        // Skip a matching string
        public bool SkipStringI(string str)
        {
            if (!DoesMatchI(str)) return false;
            SkipForward(str.Length);
            return true;
        }

        // Skip any whitespace
        public bool SkipWhitespace()
        {
            if (!char.IsWhiteSpace(Current))
                return false;
            SkipForward(1);

            while (char.IsWhiteSpace(Current))
                SkipForward(1);

            return true;
        }

        // Check if a character is space or tab
        public static bool IsLineSpace(char ch)
        {
            return ch == ' ' || ch == '\t';
        }

        // Skip spaces and tabs
        public bool SkipLinespace()
        {
            if (!IsLineSpace(Current))
                return false;
            SkipForward(1);

            while (IsLineSpace(Current))
                SkipForward(1);

            return true;
        }

        // Does current character match something
        public bool DoesMatch(char ch)
        {
            return Current == ch;
        }

        // Does character at offset match a character
        public bool DoesMatch(int offset, char ch)
        {
            return CharAtOffset(offset) == ch;
        }

        // Does current character match any of a range of characters
        public bool DoesMatchAny(char[] chars)
        {
            return chars.Any(DoesMatch);
        }

        // Does current character match any of a range of characters
        public bool DoesMatchAny(int offset, char[] chars)
        {
            return chars.Any(t => DoesMatch(offset, t));
        }

        // Does current string position match a string
        public bool DoesMatch(string str)
        {
            return !str.Where((t, i) => t != CharAtOffset(i)).Any();
        }

        // Does current string position match a string
        public bool DoesMatchI(string str)
        {
            return string.Compare(str, Substring(Position, str.Length), StringComparison.OrdinalIgnoreCase) == 0;
        }

        // Extract a substring
        public string Substring(int start)
        {
            return Input.Substring(start, _end - start);
        }

        // Extract a substring
        public string Substring(int start, int len)
        {
            if (start + len > _end)
                len = _end - start;

            return Input.Substring(start, len);
        }

        // Scan forward for a character
        public bool Find(char ch)
        {
            if (_pos >= _end)
                return false;

            // Find it
            var index = Input.IndexOf(ch, _pos);
            if (index < 0 || index >= _end)
                return false;

            // Store new position
            _pos = index;
            return true;
        }

        // Find any of a range of characters
        public bool FindAny(char[] chars)
        {
            if (_pos >= _end)
                return false;

            // Find it
            var index = Input.IndexOfAny(chars, _pos);
            if (index < 0 || index >= _end)
                return false;

            // Store new position
            _pos = index;
            return true;
        }

        // Forward scan for a string
        public bool Find(string find)
        {
            if (_pos >= _end)
                return false;

            var index = Input.IndexOf(find, _pos, StringComparison.Ordinal);
            if (index < 0 || index > _end - find.Length)
                return false;

            _pos = index;
            return true;
        }

        // Forward scan for a string (case insensitive)
        public bool FindI(string find)
        {
            if (_pos >= _end)
                return false;

            var index = Input.IndexOf(find, _pos, StringComparison.InvariantCultureIgnoreCase);
            if (index < 0 || index >= _end - find.Length)
                return false;

            _pos = index;
            return true;
        }

        // Are we at eof?
        public bool Eof => _pos >= _end;

        // Are we at eol?
        public bool Eol => IsLineEnd(Current);

        // Are we at bof?
        public bool Bof => _pos == _start;

        // Mark current position
        public void Mark()
        {
            _mark = _pos;
        }

        // Extract string from mark to current position
        public string Extract()
        {
            return _mark >= _pos ? "" : Input.Substring(_mark, _pos - _mark);
        }

        // Skip an identifier
        public bool SkipIdentifier(ref string identifier)
        {
            var savePosition = Position;
            if (!Utils.ParseIdentifier(Input, ref _pos, ref identifier))
                return false;
            if (_pos < _end) return true;
            _pos = savePosition;
            return false;
        }

        public bool SkipFootnoteID(out string id)
        {
            var savePosition = Position;

            SkipLinespace();

            Mark();

            while (true)
            {
                var ch = Current;
                if (char.IsLetterOrDigit(ch) || ch == '-' || ch == '_' || ch == ':' || ch == '.' || ch == ' ')
                    SkipForward(1);
                else
                    break;
            }

            if (Position > _mark)
            {
                id = Extract().Trim();
                if (!string.IsNullOrEmpty(id))
                {
                    SkipLinespace();
                    return true;
                }
            }

            Position = savePosition;
            id = null;
            return false;
        }

        // Skip a Html entity (eg: &amp;)
        public bool SkipHtmlEntity(ref string entity)
        {
            var savePosition = Position;
            if (!Utils.SkipHtmlEntity(Input, ref _pos, ref entity))
                return false;
            if (_pos <= _end) return true;
            _pos = savePosition;
            return false;
        }

        // Check if a character marks end of line
        public static bool IsLineEnd(char ch)
        {
            return ch == '\r' || ch == '\n' || ch == '\0';
        }

        // Attributes
        private int _start;
        private int _pos;
        private int _end;
        private int _mark;
    }
}
