/* global prompt */
/* global alert */
/* global MarkdownDeep*/
var MarkdownDeepEditor = new function () {
    'use strict';
    var ie = false,
        priv,
        pub,
        keycodeTab = 9,
        keycodeEnter = 13,
        keycodePgup = 33,
        keycodePgdn = 34,
        keycodeHome = 36,
        keycodeEnd = 35,
        keycodeLeft = 37,
        keycodeRight = 39,
        keycodeUp = 38,
        keycodeDown = 40,
        keycodeBackspace = 8,
        keycodeDelete = 46,
        undomodeUnknown = 0,
        undomodeText = 1,
        undomodeErase = 2,
        undoMode = 3,
        undomodeWhitespace = 4,
        shortcutKeys = {
            'Z': 'undo',
            'Y': 'redo',
            'B': 'bold',
            'I': 'italic',
            'H': 'heading',
            'K': 'code',
            'U': 'ullist',
            'O': 'ollist',
            'Q': 'indent',
            'E': 'outdent',
            'L': 'link',
            'G': 'img',
            'R': 'hr',
            '0': 'h0',
            '1': 'h1',
            '2': 'h2',
            '3': 'h3',
            '4': 'h4',
            '5': 'h5',
            '6': 'h6'
        };

    function startsWith(str, match) {
        return str.substr(0, match.length) === match;
    }

    function endsWith(str, match) {
        return str.substr(-match.length) === match;
    }

    function isWhitespace(ch) {
        return (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n');
    }

    function isCrlf(ch) {
        return (ch === '\r' || ch === '\n');
    }

    function trim(str) {
        var i = 0,
        l = str.length;
        while (i < l && isWhitespace(str.charAt(i))) {
            i++;
        }

        while (l - 1 > i && isWhitespace(str.charAt(l - 1))) {
            l--;
        }

        return str.substr(i, l - i);
    }

    // Helper for binding events
    function bindEvent(obj, event, handler) {
        if (obj.addEventListener) {
            obj.addEventListener(event, handler, false);
        }
        else if (obj.attachEvent) {
            obj.attachEvent('on' + event, handler);
        }
    }

    // Helper for unbinding events
    function unbindEvent(obj, event, handler) {
        if (obj.removeEventListener) {
            obj.removeEventListener(event, handler, false);
        }
        else if (obj.detachEvent) {
            obj.detachEvent('on' + event, handler);
        }
    }

    function preventEventDefault(event) {
        if (event.preventDefault) {
            event.preventDefault();
        }

        if (event.cancelBubble !== undefined) {
            event.cancelBubble = true;
            event.keyCode = 0;
            event.returnValue = false;
        }

        return false;
    }

    // EditorState represents the initial and final state of an edit
    // ReSharper disable once InconsistentNaming
    function EditorState() {
    }

    priv = EditorState.prototype;

    priv.InitFromTextArea = function (textarea) {
        var sel, temp, basepos;
        this.Textarea = textarea;
        if (ie) {
            sel = document.selection.createRange();
            temp = sel.duplicate();
            temp.moveToElementText(textarea);
            basepos = -temp.moveStart('character', -10000000);
            this.selectionStart = -sel.moveStart('character', -10000000) - basepos;
            this.selectionEnd = -sel.moveEnd('character', -10000000) - basepos;
            this.text = textarea.value.replace(/\r\n/gm, '\n');
        } else {
            this.selectionStart = textarea.selectionStart;
            this.selectionEnd = textarea.selectionEnd;
            this.text = textarea.value;
        }
    };

    priv.Duplicate = function () {
        var other = new EditorState();
        other.Textarea = this.Textarea;
        other.selectionEnd = this.selectionEnd;
        other.selectionStart = this.selectionStart;
        other.text = this.text;
        return other;
    };

    priv.Apply = function () {
        var r, scrollTop;
        if (ie) {
            this.Textarea.value = this.text;
            this.Textarea.focus();
            r = this.Textarea.createTextRange();
            r.collapse(true);
            r.moveEnd('character', this.selectionEnd);
            r.moveStart('character', this.selectionStart);
            r.select();
        } else {
            // Set the new text
            scrollTop = this.Textarea.scrollTop;
            this.Textarea.value = this.text;
            this.Textarea.focus();
            this.Textarea.setSelectionRange(this.selectionStart, this.selectionEnd);
            this.Textarea.scrollTop = scrollTop;
        }
    };

    priv.ReplaceSelection = function (str) {
        this.text = this.text.substr(0, this.selectionStart) + str + this.text.substr(this.selectionEnd);
        this.selectionEnd = this.selectionStart + str.length;
    };

    function adjustPos(pos2, editpos, del, ins) {
        if (pos2 < editpos) {
            return pos2;
        }
        return pos2 < editpos + del ? editpos : pos2 + ins - del;
    }

    priv.ReplaceAt = function (pos, len, str) {
        this.text = this.text.substr(0, pos) + str + this.text.substr(pos + len);
        this.selectionStart = adjustPos(this.selectionStart, pos, len, str.length);
        this.selectionEnd = adjustPos(this.selectionEnd, pos, len, str.length);
    };

    priv.getSelectedText = function () {
        return this.text.substr(this.selectionStart, this.selectionEnd - this.selectionStart);
    };

    priv.InflateSelection = function (ds, de) {
        this.selectionEnd += de;
        this.selectionStart -= ds;
    };

    priv.PreceededBy = function (str) {
        return this.selectionStart >= str.length &&
            this.text.substr(this.selectionStart - str.length, str.length) === str;
    };

    priv.FollowedBy = function (str) {
        return this.text.substr(this.selectionEnd, str.length) === str;
    };

    priv.TrimSelection = function () {
        while (isWhitespace(this.text.charAt(this.selectionStart))) {
            this.selectionStart++;
        }
        while (this.selectionEnd > this.selectionStart && isWhitespace(this.text.charAt(this.selectionEnd - 1))) {
            this.selectionEnd--;
        }
    };

    priv.IsStartOfLine = function (pos) {
        return pos === 0 || isCrlf(this.text.charAt(pos - 1));
    };

    priv.FindStartOfLine = function (pos) {
        // Move start of selection back to line start
        while (pos > 0 && !isCrlf(this.text.charAt(pos - 1))) {
            pos--;
        }

        return pos;
    };

    priv.FindEndOfLine = function (pos) {
        while (pos < this.text.length && !isCrlf(this.text.charAt(pos))) {
            pos++;
        }

        return pos;
    };

    priv.FindNextLine = function (pos) {
        return this.SkipEol(this.FindEndOfLine(pos));
    };

    priv.SkipWhiteSpace = function (pos) {
        while (pos < this.text.length && isWhitespace(this.text.charAt(pos))) {
            pos++;
        }
        return pos;
    };

    priv.SkipEol = function (pos) {
        if (this.text.substr(pos, 2) === '\r\n') {
            return pos + 2;
        }
        if (isCrlf(this.text.charAt(pos))) {
            return pos + 1;
        }
        return pos;
    };

    priv.SkipPreceedingEol = function (pos) {
        if (pos > 2 && this.text.substr(pos - 2, 2) === '\r\n') {
            return pos - 2;
        }
        if (pos > 1 && isCrlf(this.text.charAt(pos - 1))) {
            return pos - 1;
        }
        return pos;
    };

    priv.SelectWholeLines = function () {
        // Move selection to start of line
        this.selectionStart = this.FindStartOfLine(this.selectionStart);
        // Move end of selection to start of the next line
        if (!this.IsStartOfLine(this.selectionEnd)) {
            this.selectionEnd = this.SkipEol(this.FindEndOfLine(this.selectionEnd));
        }
    };

    priv.SkipPreceedingWhiteSpace = function (pos) {
        while (pos > 0 && isWhitespace(this.text.charAt(pos - 1))) {
            pos--;
        }

        return pos;
    };

    priv.SkipFollowingWhiteSpace = function (pos) {
        while (isWhitespace(this.text.charAt(pos))) {
            pos++;
        }

        return pos;
    };

    priv.SelectSurroundingWhiteSpace = function () {
        this.selectionStart = this.SkipPreceedingWhiteSpace(this.selectionStart);
        this.selectionEnd = this.SkipFollowingWhiteSpace(this.selectionEnd);
    };

    priv.CheckSimpleSelection = function () {
        var text = this.getSelectedText(), m = text.match(/\n[ \t\r]*\n/);
        if (m) {
            alert('Please make a selection that doesn\'t include a paragraph break');
            return false;
        }

        return true;
    };

    // Check if line is completely blank
    priv.IsBlankLine = function (p) {
        var len = this.text.length, ch, i;
        for (i = p; i < len; i++) {
            ch = this.text[i];
            if (isCrlf(ch)) {
                return true;
            }
            if (!isWhitespace(this.text.charAt(i))) {
                return false;
            }
        }

        return true;
    };

    priv.FindStartOfParagraph = function (pos) {
        var savepos = pos, p;
        // Move to start of first line
        pos = this.FindStartOfLine(pos);
        if (this.IsBlankLine(pos)) {
            return pos;
        }
        // Move to first line after blank line
        while (pos > 0) {
            p = this.FindStartOfLine(this.SkipPreceedingEol(pos));
            if (p === 0) {
                break;
            }
            if (this.IsBlankLine(p)) {
                break;
            }
            pos = p;
        }

        // Is it a list?
        if (this.DetectListType(pos).prefixLen !== 0) {
            // Do it again, but stop at line with list prefix
            pos = this.FindStartOfLine(savepos);
            // Move to first line after blank line
            while (pos > 0) {
                if (this.DetectListType(pos).prefixLen !== 0) {
                    return pos;
                }
                // go to line before
                pos = this.FindStartOfLine(this.SkipPreceedingEol(pos));
            }
        }

        return pos;
    };

    priv.FindEndOfParagraph = function (pos) {
        // Skip all lines that aren't blank
        while (pos < this.text.length) {
            if (this.IsBlankLine(pos)) {
                break;
            }
            pos = this.FindNextLine(pos);
        }

        return pos;
    };

    // Select the paragraph
    priv.SelectParagraph = function () {
        this.selectionStart = this.FindStartOfParagraph(this.selectionStart);
        this.selectionEnd = this.FindEndOfParagraph(this.selectionStart);
    };

    // Starting at position pos, return the list type
    // returns { listType, prefixLen }

    priv.DetectListType = function (pos) {
        var prefix = this.text.substr(pos, 10), m = prefix.match(/^\s{0,3}(\*|\d+\.)(?:\ |\t)*/);
        if (!m) {
            return { listType: '', prefixLen: 0 };
        }
        if (m[1] === '*') {
            return { listType: '*', prefixLen: m[0].length };
        } else {
            return { listType: '1', prefixLen: m[0].length };
        }
    };

    // Editor
    function editor(textarea, divHtml) {
        // Is it IE?
        if (!textarea.setSelectionRange) {
            ie = true;
        }

        // Initialize
        this.LastContent = null;
        this.UndoStack = [];
        this.UndoPosition = 0;
        this.UndoMode = undoMode;
        this.Markdown = new MarkdownDeep.Markdown();
        this.Markdown.SafeMode = false;
        this.Markdown.ExtraMode = true;
        this.Markdown.NewWindowForLocalLinks = true;
        this.Markdown.NewWindowForExternalLinks = true;
        // Store DOM elements
        this.Textarea = textarea;
        this.PreviewDiv = divHtml;
        // Bind events
        var self = this;
        bindEvent(textarea, 'keyup', function () {
            self.onMarkdownChanged();
        });
        bindEvent(textarea, 'keydown', function (e) {
            return self.onKeyDown(e);
        });
        bindEvent(textarea, 'paste', function () {
            self.onMarkdownChanged();
        });
        bindEvent(textarea, 'input', function () {
            self.onMarkdownChanged();
        });
        bindEvent(textarea, 'mousedown', function () {
            self.SetUndoMode(undoMode);
        });
        // Do initial update
        this.onMarkdownChanged();
    }

    priv = editor.prototype;
    pub = editor.prototype;
    priv.onKeyDown = function (e) {
        var newMode = null, key;
        // Normal keys only
        if (e.ctrlKey || e.metaKey) {
            key = String.fromCharCode(e.charCode || e.keyCode);
            // Built in short cut key?
            if (!this.disableShortCutKeys && shortcutKeys[key] !== undefined) {
                this.InvokeCommand(shortcutKeys[key]);
                return preventEventDefault(e);
            }

            // Standard keys
            switch (key) {
            case 'V': // Paste
                newMode = undomodeText;
                break;
            case 'X': // Cut
                newMode = undomodeErase;
                break;
            }
        } else {
            switch (e.keyCode) {
            case keycodeTab:
                if (!this.disableTabHandling) {
                    this.InvokeCommand(e.shiftKey ? 'untab' : 'tab');
                    return preventEventDefault(e);
                } else {
                    newMode = undomodeText;
                }

                break;
            case keycodeLeft:
            case keycodeRight:
            case keycodeUp:
            case keycodeDown:
            case keycodeHome:
            case keycodeEnd:
            case keycodePgup:
            case keycodePgdn:
                // Navigation mode
                newMode = undoMode;
                break;
            case keycodeBackspace:
            case keycodeDelete:
                // Delete mode
                newMode = undomodeErase;
                break;
            case keycodeEnter:
                // New lines mode
                newMode = undomodeWhitespace;
                break;
            default:
                // Text mode
                newMode = undomodeText;
            }
        }

        if (newMode != null) {
            this.SetUndoMode(newMode);
        }
        // Special handling for enter key
        if (!this.disableAutoIndent) {
            if (e.keyCode === keycodeEnter && (!ie || e.ctrlKey)) {
                this.IndentNewLine();
            }
        }
    };

    priv.SetUndoMode = function (newMode) {
        // Same mode?
        if (this.UndoMode === newMode) {
            return;
        }
        // Enter new mode, after capturing current state
        this.UndoMode = newMode;
        // Capture undo state
        this.CaptureUndoState();
    };

    priv.CaptureUndoState = function () {
        // Store a copy on the undo stack
        var state = new EditorState();
        state.InitFromTextArea(this.Textarea);
        this.UndoStack.splice(this.UndoPosition, this.UndoStack.length - this.UndoPosition, state);
        this.UndoPosition = this.UndoStack.length;
    };

    priv.onMarkdownChanged = function () {
        // Get the markdown, see if it's changed
        var newContent = this.Textarea.value, output;
        if (newContent === this.LastContent && this.LastContent !== null) {
            return;
        }
        // Call pre hook
        if (this.onPreTransform) {
            this.onPreTransform(this, newContent);
        }
        // Transform
        output = this.Markdown.Transform(newContent);
        // Call post hook
        if (this.onPostTransform) {
            this.onPostTransform(this, output);
        }
        // Update the DOM
        if (this.PreviewDiv) {
            this.PreviewDiv.innerHTML = output;
        }
        /*
    if (this.m_divSource)
    {
        this.m_divSource.innerHTML="";
        this.m_divSource.appendChild(document.createTextNode(output));
    }

    */
        // Call post update dom handler
        if (this.onPostUpdateDom) {
            this.onPostUpdateDom(this);
        }
        // Save previous content
        this.LastContent = newContent;
    };

    // Public method, should be called by client code if any of the MarkdownDeep
    // transform options have changed
    pub.onOptionsChanged = function () {
        this.LastContent = null;
        this.onMarkdownChanged();
    };

    pub.commandUndo = function () {
        if (this.UndoPosition > 0) {
            // Capture current state at end of undo buffer.
            if (this.UndoPosition === this.UndoStack.length) {
                this.CaptureUndoState();
                this.UndoPosition--;
            }

            this.UndoPosition--;
            this.UndoStack[this.UndoPosition].Apply();
            this.UndoMode = undomodeUnknown;
            // Update markdown rendering
            this.onMarkdownChanged();
        }
    };

    pub.commandRedo = function () {
        if (this.UndoPosition + 1 < this.UndoStack.length) {
            this.UndoPosition++;
            this.UndoStack[this.UndoPosition].Apply();
            this.UndoMode = undomodeUnknown;
            // Update markdown rendering
            this.onMarkdownChanged();
            // We're back at the current state
            if (this.UndoPosition === this.UndoStack.length - 1) {
                this.UndoStack.pop();
            }
        }
    };

    priv.setHeadingLevel = function (state, headingLevel) {
        // Select the entire heading
        state.SelectParagraph();
        state.SelectSurroundingWhiteSpace();
        // Get the selected text
        var text = state.getSelectedText(), currentHeadingLevel, m, selOffset, selLen, h, i;
        // Trim all whitespace
        text = trim(text);
        m = text.match(/^(\#+)(.*?)(\#+)?$/);
        if (m) {
            text = trim(m[2]);
            currentHeadingLevel = m[1].length;
        } else {
            m = text.match(/^(.*?)(?:\r\n|\n|\r)\s*(\-*|\=*)$/);
            if (m) {
                text = trim(m[1]);
                currentHeadingLevel = m[2].charAt(0) === '=' ? 1 : 0;
            } else {
                // Remove blank lines
                text = text.replace(/(\r\n|\n|\r)/gm, '');
                currentHeadingLevel = 0;
            }
        }

        if (headingLevel === -1) {
            headingLevel = (currentHeadingLevel + 1) % 4;
        }
        // Removing a heading
        if (headingLevel === 0) {
            // Deleting selection
            if (text === 'Heading') {
                state.ReplaceSelection('');
                return true;
            }

            selLen = text.length;
            selOffset = 0;
        } else {
            if (text === '') {
                text = 'Heading';
            }
            selOffset = headingLevel + 1;
            selLen = text.length;
            h = '';
            for (i = 0; i < headingLevel; i++) {
                h += '#';
            }
            text = h + ' ' + text + ' ' + h;
        }

        // Require blank after
        text += '\n\n';
        if (state.selectionStart !== 0) {
            text = '\n\n' + text;
            selOffset += 2;
        }

        // Replace text
        state.ReplaceSelection(text);
        // Update selection
        state.selectionStart += selOffset;
        state.selectionEnd = state.selectionStart + selLen;
        return true;
    };

    pub.commandHeading = function (state) {
        return this.setHeadingLevel(state, -1);
    };

    pub.commandH0 = function (state) {
        return this.setHeadingLevel(state, 0);
    };

    pub.commandH1 = function (state) {
        return this.setHeadingLevel(state, 1);
    };

    pub.commandH2 = function (state) {
        return this.setHeadingLevel(state, 2);
    };

    pub.commandH3 = function (state) {
        return this.setHeadingLevel(state, 3);
    };

    pub.commandH4 = function (state) {
        return this.setHeadingLevel(state, 4);
    };

    pub.commandH5 = function (state) {
        return this.setHeadingLevel(state, 5);
    };

    pub.commandH6 = function (state) {
        return this.setHeadingLevel(state, 6);
    };

    priv.IndentCodeBlock = function (state, indent) {
        var i = 0, newLead, position, newLine, lines, newline;
        // Make sure whole lines are selected
        state.SelectWholeLines();
        // Get the text, split into lines
        lines = state.getSelectedText().split('\n');
        // Convert leading tabs to spaces
        for (i = 0; i < lines.length; i++) {
            if (lines[i].charAt(0) === '\t') {
                newLead = '';
                position = 0;
                while (lines[i].charAt(position) === '\t') {
                    newLead += '    ';
                    position++;
                }

                newLine = newLead + lines[i].substr(position);
                lines.splice(i, 1, newLine);
            }
        }

        // Toggle indent/unindent?
        if (indent === null) {
            for (i = 0; i < lines.length; i++) {
                // Blank lines are allowed
                if (trim(lines[i]) === '') {
                    continue;
                }
                // Convert leading tabs to spaces
                if (lines[i].charAt(0) === '\t') {
                    newLead = '';
                    position = 0;
                    while (lines[i].charAt(position) === '\t') {
                        newLead += '    ';
                        position++;
                    }

                    newLine = newLead + lines[i].substr(i);
                    lines.splice(i, 1, newLine);
                }

                // Tabbed line
                if (!startsWith(lines[i], '    ')) {
                    break;
                }
            }

            // Are we adding or removing indent
            indent = i !== lines.length;
        }

        // Apply the changes
        for (i = 0; i < lines.length; i++) {
            // Blank line?
            if (trim(lines[i]) === '') {
                continue;
            }
            // Tabbed line
            newline = lines[i];
            if (indent) {
                newline = '    ' + lines[i];
            } else {
                if (startsWith(lines[i], '\t')) {
                    newline = lines[i].substr(1);
                } else if (startsWith(lines[i], '    ')) {
                    newline = lines[i].substr(4);
                }
            }

            lines.splice(i, 1, newline);
        }

        // Replace
        state.ReplaceSelection(lines.join('\n'));
    };

    // Code
    pub.commandCode = function (state) {
        // Cursor on a blank line?
        if (state.selectionStart === state.selectionEnd) {
            var line = state.FindStartOfLine(state.selectionStart);
            if (state.IsBlankLine(line)) {
                state.SelectSurroundingWhiteSpace();
                state.ReplaceSelection('\n\n    Code\n\n');
                state.selectionStart += 6;
                state.selectionEnd = state.selectionStart + 4;
                return true;
            }
        }

        // If the current text is preceded by a non-whitespace, or followed by a non-whitespace
        // then do an inline code
        if (state.getSelectedText().indexOf('\n') < 0) {
            // Expand selection to include leading/trailing stars
            state.TrimSelection();
            if (state.PreceededBy('`')) {
                state.selectionStart--;
            }
            if (state.FollowedBy('`')) {
                state.selectionEnd++;
            }
            return this.boldOrItalic(state, '`');
        }

        this.IndentCodeBlock(state, null);
        return true;
    };

    pub.commandTab = function (state) {
        if (state.getSelectedText().indexOf('\n') > 0) {
            this.IndentCodeBlock(state, true);
        } else {
            // If we're in the leading whitespace of a line
            // insert spaces instead of an actual tab character
            var lineStart = state.FindStartOfLine(state.selectionStart), p, spacesToNextTabStop;
            for (p = lineStart; p < state.selectionStart; p++) {
                if (state.text.charAt(p) !== ' ') {
                    break;
                }
            }

            // All spaces?
            if (p === state.selectionStart) {
                spacesToNextTabStop = 4 - ((p - lineStart) % 4);
                state.ReplaceSelection('    '.substr(0, spacesToNextTabStop));
            } else {
                state.ReplaceSelection('\t');
            }

            state.selectionStart = state.selectionEnd;
        }

        return true;
    };

    pub.commandUntab = function (state) {
        if (state.getSelectedText().indexOf('\n') > 0) {
            this.IndentCodeBlock(state, false);
            return true;
        }

        return false;
    };

    priv.boldOrItalic = function (state, marker) {
        var markerLength = marker.length, text = state.getSelectedText();
        if (startsWith(text, marker) && endsWith(text, marker)) {
            // Remove
            state.ReplaceSelection(text.substr(markerLength, text.length - markerLength * 2));
        } else {
            // Add
            state.TrimSelection();
            text = state.getSelectedText();
            if (!text) {
                text = 'text';
            } else {
                text = text.replace(/(\r\n|\n|\r)/gm, '');
            }
            state.ReplaceSelection(marker + text + marker);
            state.InflateSelection(-markerLength, -markerLength);
        }

        return true;
    };

    // Bold
    pub.commandBold = function (state) {
        if (!state.CheckSimpleSelection()) {
            return false;
        }
        state.TrimSelection();
        // Expand selection to include leading/trailing stars
        if (state.PreceededBy('**')) {
            state.selectionStart -= 2;
        }
        if (state.FollowedBy('**')) {
            state.selectionEnd += 2;
        }
        return this.boldOrItalic(state, '**');
    };

    // Italic
    pub.commandItalic = function (state) {
        if (!state.CheckSimpleSelection()) {
            return false;
        }
        state.TrimSelection();
        // Expand selection to include leading/trailing stars
        if ((state.PreceededBy('*') && !state.PreceededBy('**')) || state.PreceededBy('***')) {
            state.selectionStart -= 1;
        }
        if ((state.FollowedBy('*') && !state.PreceededBy('**')) || state.FollowedBy('***')) {
            state.selectionEnd += 1;
        }
        return this.boldOrItalic(state, '*');
    };

    priv.indentOrOutdent = function (state, outdent) {
        // Make sure whole lines are selected
        state.SelectWholeLines();
        // Get the text, split into lines and check if all lines
        // are indented
        var lines = state.getSelectedText().split('\n'), i, newline;
        // Apply the changes
        for (i = 0; i < lines.length - 1; i++) {
            // Tabbed line
            newline = lines[i];
            if (outdent) {
                if (startsWith(lines[i], '> ')) {
                    newline = lines[i].substr(2);
                }
            } else {
                newline = '> ' + lines[i];
            }

            lines.splice(i, 1, newline);
        }

        // Replace
        state.ReplaceSelection(lines.join('\n'));
        return true;
    };

    // Quote
    pub.commandIndent = function (state) {
        return this.indentOrOutdent(state, false);
    };

    pub.commandOutdent = function (state) {
        return this.indentOrOutdent(state, true);
    };

    priv.handleList = function (state, type) {
        // Build an array of selected line offsets
        var lines = [], line, i, listType, prefix, mdd, listitems, dx, newNumber, newlistitems;
        if (state.getSelectedText().indexOf('\n') > 0) {
            state.SelectWholeLines();
            line = state.selectionStart;
            lines.push(line);
            while (true) {
                line = state.FindNextLine(line);
                if (line >= state.selectionEnd) {
                    break;
                }
                lines.push(line);
            }
        } else {
            lines.push(state.FindStartOfLine(state.selectionStart));
        }

        // Now work out the new list type
        // If the current selection only contains the current list type
        // then remove list items
        prefix = type === '*' ? '* ' : '1. ';
        for (i = 0; i < lines.length; i++) {
            listType = state.DetectListType(lines[i]);
            if (listType.listType === type) {
                prefix = '';
                break;
            }
        }

        // Update the prefix on all lines
        for (i = lines.length - 1; i >= 0; i--) {
            line = lines[i];
            listType = state.DetectListType(line);
            state.ReplaceAt(line, listType.prefixLen, prefix);
        }

        // We now need to find any surrounding lists and renumber them
        mdd = new MarkdownDeep.Markdown();
        mdd.ExtraMode = true;
        listitems = mdd.GetListItems(state.text, state.selectionStart);
        while (listitems != null) {
            // Process each list item
            dx = 0;
            for (i = 0; i < listitems.length - 1; i++) {
                // Detect the list type
                listType = state.DetectListType(listitems[i] + dx);
                if (listType.listType !== '1') {
                    break;
                }
                // Format new number prefix
                newNumber = (i + 1).toString() + '. ';
                // Replace it
                state.ReplaceAt(listitems[i] + dx, listType.prefixLen, newNumber);
                // Adjust things if new prefix is different length to the previos
                dx += newNumber.length - listType.prefixLen;
            }

            newlistitems = mdd.GetListItems(state.text, listitems[listitems.length - 1] + dx);
            if (newlistitems != null && newlistitems[0] !== listitems[0]) {
                listitems = newlistitems;
            } else {
                listitems = null;
            }
        }

        // Select lines
        if (lines.length > 1) {
            state.SelectWholeLines();
        }

        return true;
    };

    pub.commandUllist = function (state) {
        return this.handleList(state, '*');
    };

    pub.commandOllist = function (state) {
        return this.handleList(state, '1');
    };

    pub.commandLink = function (ctx) {
        var url, text, str;
        ctx.TrimSelection();
        if (!ctx.CheckSimpleSelection()) {
            return false;
        }
        url = prompt('Enter the target URL:');
        if (url === null) {
            return false;
        }
        text = ctx.getSelectedText();
        if (text.length === 0) {
            text = 'link text';
        }

        str = '[' + text + '](' + url + ')';
        ctx.ReplaceSelection(str);
        ctx.selectionStart++;
        ctx.selectionEnd = ctx.selectionStart + text.length;
        return true;
    };

    pub.commandImg = function (ctx) {
        var url, alttext, str;
        ctx.TrimSelection();
        if (!ctx.CheckSimpleSelection()) {
            return false;
        }
        url = prompt('Enter the image URL');
        if (url === null) {
            return false;
        }
        alttext = ctx.getSelectedText();
        if (alttext.length === 0) {
            alttext = 'Image Text';
        }

        str = '![' + alttext + '](' + url + ')';
        ctx.ReplaceSelection(str);
        ctx.selectionStart += 2;
        ctx.selectionEnd = ctx.selectionStart + alttext.length;
        return true;
    };

    pub.commandHr = function (state) {
        state.SelectSurroundingWhiteSpace();
        if (state.selectionStart === 0) {
            state.ReplaceSelection('----------\n\n');
        } else {
            state.ReplaceSelection('\n\n--------\n\n');
        }
        state.selectionStart = state.selectionEnd;
        return true;
    };

    pub.IndentNewLine = function () {
        var self = this,
            timer,
            handler = function () {
                var state, prevline, i, ch;
                window.clearInterval(timer);
                // Create an editor state from the current selection
                state = new EditorState();
                state.InitFromTextArea(self.Textarea);
                // Find start of previous line
                prevline = state.FindStartOfLine(state.SkipPreceedingEol(state.selectionStart));
                // Count spaces and tabs
                i = prevline;
                while (true) {
                    ch = state.text.charAt(i);
                    if (ch !== ' ' && ch !== '\t') {
                        break;
                    }
                    i++;
                }

                // Copy spaces and tabs to the new line
                if (i > prevline) {
                    state.ReplaceSelection(state.text.substr(prevline, i - prevline));
                    state.selectionStart = state.selectionEnd;
                }

                state.Apply();
            };

        timer = window.setInterval(handler, 1);
        return false;
    };

    pub.commandIndentedNewline = function (state) {
        // Do default new line
        state.ReplaceSelection('\n');
        state.selectionStart = state.selectionEnd;
        // Find start of previous line
        var prevline = state.FindStartOfLine(state.SkipPreceedingEol(state.selectionStart)),
            i = prevline,
            ch;
        // Count spaces and tabs
        while (true) {
            ch = state.text.charAt(i);
            if (ch !== ' ' && ch !== '\t') {
                break;
            }
            i++;
        }

        // Copy spaces and tabs to the new line
        if (i > prevline) {
            state.ReplaceSelection(state.text.substr(prevline, i - prevline));
            state.selectionStart = state.selectionEnd;
        }

        return true;
    };

    // Handle toolbar button
    pub.InvokeCommand = function (id) {
        var state,
            originalState,
            commandFunction = ('command ' + id).replace(/(?:^\w|[A-Z]|\b\w|\s+)/g,
                function (match, index) {
                    if (+match === 0) {
                        return '';
                    }
                    return index === 0 ? match.toLowerCase() : match.toUpperCase();
                });
        // Special handling for undo and redo
        if (id === 'undo' || id === 'redo') {
            this[commandFunction]();
            this.Textarea.focus();
            return true;
        }

        // Create an editor state from the current selection
        state = new EditorState();
        state.InitFromTextArea(this.Textarea);
        // Create a copy for undo buffer
        originalState = state.Duplicate();
        // Call the handler and apply changes
        if (this[commandFunction](state)) {
            // Save current state on undo stack
            this.UndoMode = undomodeUnknown;
            this.UndoStack.splice(this.UndoPosition, this.UndoStack.length - this.UndoPosition, originalState);
            this.UndoPosition++;
            // Apply new state
            state.Apply();
            // Update markdown rendering
            this.onMarkdownChanged();
            return true;
        } else {
            this.Textarea.focus();
            return false;
        }
    };
    // Exports
    this.Editor = editor;
}();
