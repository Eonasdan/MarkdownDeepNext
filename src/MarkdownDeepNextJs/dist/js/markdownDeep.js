/*! version : 2.0.1
 =========================================================
 MarkdownDeepNextjs
 https://github.com/Eonasdan/MarkdownDeepNext
 Copyright (c) 2015 Jonathan Peterson
 =========================================================
 */
/*
 The MIT License (MIT)

 Copyright (c) 2015 Jonathan Peterson

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 */
/*jslint bitwise: true */
var MarkdownDeep = new function () {
    'use strict';
    var markdownPrototype,
       htmlTagFlagsBlock = 0x0001, // Block tag
       htmlTagFlagsInline = 0x0002, // Inline tag
       htmlTagFlagsNoClosing = 0x0004, // No closing tag (eg: <hr> and <!-- -->)
       htmlTagFlagsContentAsSpan = 0x0008,// When markdown=1 treat content as span, not block
       tagFlags, allowedTags, allowedAttributes,
       tagFlagsBlock = htmlTagFlagsBlock, tagFlagsInline = htmlTagFlagsInline,
       tagFlagsNoClosing = htmlTagFlagsNoClosing,
       tagFlagsContentAsSpan = htmlTagFlagsContentAsSpan,
       tokenTypeText = 0, tokenTypeHtmlTag = 1, tokenTypeHtml = 2, tokenTypeOpenEm = 3, tokenTypeCloseEm = 4,
       tokenTypeOpenStrong = 5, tokenTypeCloseStrong = 6, tokenTypeCodeSpan = 7, tokenTypeBr = 8,
       tokenTypeLink = 9, tokenTypeImg = 10, tokenTypeOpeningMark = 11, tokenTypeClosingMark = 12,
       tokenTypeInternalMark = 13, tokenTypeFootnote = 14, tokenTypeAbbreviation = 15,
       columnAlignmentNa = 0, columnAlignmentLeft = 1, columnAlignmentRight = 2, columnAlignmentCenter = 3,
       markdownInHtmlModeNa = 0, markdownInHtmlModeBlock = 1, markdownInHtmlModeSpan = 2, markdownInHtmlModeDeep = 3,
       markdownInHtmlModeOff = 4,
       blockTypeBlank = 0, blockTypeH1 = 1, blockTypeH2 = 2, blockTypeH3 = 3, blockTypeH4 = 4, blockTypeH5 = 5,
       blockTypeH6 = 6, blockTypePostH1 = 7, blockTypePostH2 = 8, blockTypeQuote = 9, blockTypeOlLi = 10, blockTypeUlLi = 11,
       blockTypeP = 12, blockTypeIndent = 13, blockTypeHr = 14, blockTypeUserBreak = 15, blockTypeHtml = 16,
       blockTypeUnsafeHtml = 17, blockTypeSpan = 18, blockTypeCodeblock = 19, blockTypeLi = 20, blockTypeOl = 21,
       blockTypeUl = 22, blockTypeHtmlTag = 23, blockTypeComposite = 24, blockTypeTableSpec = 25, blockTypeDd = 26,
       blockTypeDt = 27, blockTypeDl = 28, blockTypeFootnote = 29, blockTypePFootnote = 30,

       splitUserSections = function (markdownIn) {
           // Build blocks
           var md = new Markdown(), i, blocks, sections, iPrevSectionOffset, block, iSectionOffset;
           md.UserBreaks = true;

           // Process blocks
           blocks = md.ProcessBlocks(markdownIn);

           // Create sections
           sections = [];
           iPrevSectionOffset = 0;
           for (i = 0; i < blocks.length; i++) {
               block = blocks[i];
               if (block.blockType === blockTypeUserBreak) {
                   // Get the offset of the section
                   iSectionOffset = block.lineStart;

                   // Add section
                   sections.push(Markdown.substr(iPrevSectionOffset, iSectionOffset - iPrevSectionOffset).trim());

                   // Next section starts on next line
                   if (i + 1 < blocks.length) {
                       iPrevSectionOffset = blocks[i + 1].lineStart;
                       if (iPrevSectionOffset === 0) {
                           iPrevSectionOffset = blocks[i + 1].contentStart;
                       }
                   } else {
                       iPrevSectionOffset = Markdown.length;
                   }
               }
           }

           // Add the last section
           if (markdownIn.length > iPrevSectionOffset) {
               sections.push(Markdown.substring(iPrevSectionOffset).trim());
           }

           return sections;
       };

    function arrayIndexOf(array, obj) {
        if (array.indexOf !== undefined) {
            return array.indexOf(obj);
        }

        for (var i = 0; i < array.length; i++) {
            if (array[i] === obj) {
                return i;
            }
        }
        return -1;
    }

    // ReSharper disable once InconsistentNaming
    function Markdown() {
        this.spanFormatter = new SpanFormatter(this);
        this.spareBlocks = [];
        this.stringBuilder = new StringBuilder();
        this.stringBuilderFinal = new StringBuilder();
    }

    Markdown.prototype =
    {
        SafeMode: false,
        ExtraMode: true,
        MarkdownInHtml: false,
        AutoHeadingIDs: false,
        UrlBaseLocation: null,
        UrlRootLocation: null,
        NewWindowForExternalLinks: false,
        NewWindowForLocalLinks: false,
        NoFollowLinks: false,
        NoFollowExternalLinks: false,
        HtmlClassFootnotes: 'footnotes',
        HtmlClassTitledImages: null,
        RenderingTitledImage: false,
        FormatCodeBlockAttributes: null,
        FormatCodeBlock: null,
        ExtractHeadBlocks: false,
        UserBreaks: false,
        HeadBlockContent: ''
    };

    markdownPrototype = Markdown.prototype;

    function spliceArray(dest, position, del, ins) {
        return dest.slice(0, position).concat(ins).concat(dest.slice(position + del));
    }

    Markdown.prototype.GetListItems = function (input, offset) {
        // Parse content into blocks
        var blocks = this.ProcessBlocks(input), i, j, block, list = [], items;
        // Find the block
        for (i = 0; i < blocks.length; i++) {
            block = blocks[i];

            if ((block.blockType === blockTypeComposite ||
                    block.blockType === blockTypeHtml ||
                    block.blockType === blockTypeHtmlTag) &&
                block.children) {
                blocks = spliceArray(blocks, i, 1, block.children);
                i--;
                continue;
            }

            if (offset < block.lineStart) {
                break;
            }
        }
        i--;

        // Quit if at top
        if (i < 0) {
            return null;
        }

        // Get the block before
        block = blocks[i];

        // Check if it's a list
        if (block.blockType !== blockTypeUl && block.blockType !== blockTypeOl) {
            return null;
        }

        // Build list of line offsets
        items = block.children;
        for (j = 0; j < items.length; j++) {
            list.push(items[j].lineStart);
        }

        // Also push the line offset of the following block
        i++;
        if (i < blocks.length) {
            list.push(blocks[i].lineStart);
        } else {
            list.push(input.length);
        }

        return list;
    };

    // Main entry point
    Markdown.prototype.Transform = function (input) {
        // Normalize line ends
        var rpos = input.indexOf('\r'),
            i,
            npos,
            blocks,
            mAbbreviations,
            list,
            a,
            stringBuilder,
            c,
            fn,
            returnLink,
            child;
        if (rpos >= 0) {
            npos = input.indexOf('\n');
            if (npos >= 0) {
                if (npos < rpos) {
                    input = input.replace(/\n\r/g, '\n');
                } else {
                    input = input.replace(/\r\n/g, '\n');
                }
            }

            input = input.replace(/\r/g, '\n');
        }

        this.HeadBlockContent = '';

        blocks = this.ProcessBlocks(input);

        // Sort abbreviations by length, longest to shortest
        mAbbreviations = this.abbreviations;
        if (mAbbreviations !== null) {
            list = [];
            for (a in mAbbreviations) {
                if (mAbbreviations.hasOwnProperty(a)) {
                    list.push(mAbbreviations[a]);
                }
            }
            list.sort(function (c, d) {
                return d.Abbr.length - c.Abbr.length;
            });
            this.abbreviations = list;
        }

        // Render
        stringBuilder = this.stringBuilderFinal;
        stringBuilder.Clear();
        for (i = 0; i < blocks.length; i++) {
            c = blocks[i];
            c.Render(this, stringBuilder);
        }

        // Render footnotes
        if (this.usedFootnotes.length > 0) {
            stringBuilder.Append('\n<div class="');
            stringBuilder.Append(this.HtmlClassFootnotes);
            stringBuilder.Append('">\n');
            stringBuilder.Append('<hr />\n');
            stringBuilder.Append('<ol>\n');
            for (i = 0; i < this.usedFootnotes.length; i++) {
                fn = this.usedFootnotes[i];

                stringBuilder.Append('<li id="fn:');
                stringBuilder.Append(fn.data); // footnote id
                stringBuilder.Append('">\n');


                // We need to get the return link appended to the last paragraph
                // in the footnote
                returnLink = '<a href="#fnref:' + fn.data + '" rev="footnote">&#8617;</a>';

                // Get the last child of the footnote
                child = fn.children[fn.children.length - 1];
                if (child.blockType === blockTypeP) {
                    child.blockType = blockTypePFootnote;
                    child.data = returnLink;
                } else {
                    child = new Block();
                    child.contentLen = 0;
                    child.blockType = blockTypePFootnote;
                    child.data = returnLink;
                    fn.children.push(child);
                }


                fn.Render(this, stringBuilder);

                stringBuilder.Append('</li>\n');
            }
            stringBuilder.Append('</ol>\n');
            stringBuilder.Append('</div>\n');
        }

        // Done
        return stringBuilder.ToString();
    };

    Markdown.prototype.OnQualifyUrl = function (url) {
        // Is the url a fragment?
        if (startsWith(url, '#')) {
            return url;
        }

        // Is the url already fully qualified?
        if (isUrlFullyQualified(url)) {
            return url;
        }

        if (startsWith(url, '/')) {
            var rootLocation = this.UrlRootLocation, position;
            if (!rootLocation) {
                // Quit if we don't have a base location
                if (!this.UrlBaseLocation) {
                    return url;
                }

                // Need to find domain root
                position = this.UrlBaseLocation.indexOf('://');
                if (position === -1) {
                    position = 0;
                } else {
                    position += 3;
                }

                // Find the first slash after the protocol separator
                position = this.UrlBaseLocation.indexOf('/', position);

                // Get the domain name
                rootLocation = position < 0 ? this.UrlBaseLocation : this.UrlBaseLocation.substr(0, position);
            }

            // Join em
            return rootLocation + url;
        } else {
            // Quit if we don't have a base location
            if (!this.UrlBaseLocation) {
                return url;
            }

            if (!endsWith(this.UrlBaseLocation, '/')) {
                return this.UrlBaseLocation + '/' + url;
            } else {
                return this.UrlBaseLocation + url;
            }
        }
    };

    // Override and return an object with width and height properties
    Markdown.prototype.OnGetImageSize = function () {
        return null;
    };

    Markdown.prototype.OnPrepareLink = function (tag) {
        var url = tag.attributes['href'];

        // No follow?
        if (this.NoFollowLinks) {
            tag.attributes['rel'] = 'nofollow';
        }

        if (this.NoFollowExternalLinks) {
            if (isUrlFullyQualified(url)) {
                tag.attributes['rel'] = 'nofollow';
            }
        }

        // New window?
        if ((this.NewWindowForExternalLinks && isUrlFullyQualified(url)) ||
        (this.NewWindowForLocalLinks && !isUrlFullyQualified(url))) {
            tag.attributes['target'] = '_blank';
        }

        // Qualify url
        tag.attributes['href'] = this.OnQualifyUrl(url);
    };

    Markdown.prototype.OnPrepareImage = function (tag, titledImage) {
        // Try to determine width and height
        var size = this.OnGetImageSize(tag.attributes['src'], titledImage);
        if (size !== undefined && size !== null) {
            tag.attributes['width'] = size.width;
            tag.attributes['height'] = size.height;
        }

        // Now qualify the url
        tag.attributes['src'] = this.OnQualifyUrl(tag.attributes['src']);
    };

    // Get a link definition
    Markdown.prototype.GetLinkDefinition = function (id) {
        if (this.linkDefinitions.hasOwnProperty(id)) {
            return this.linkDefinitions[id];
        } else {
            return null;
        }
    };

    markdownPrototype.ProcessBlocks = function (str) {
        // Reset the list of link definitions
        this.linkDefinitions = [];
        this.footnotes = [];
        this.usedFootnotes = [];
        this.usedHeaderIDs = [];
        this.abbreviations = null;

        // Process blocks
        return new BlockProcessor(this, this.MarkdownInHtml).Process(str);
    };

    // Add a link definition
    markdownPrototype.AddLinkDefinition = function (link) {
        this.linkDefinitions[link.id] = link;
    };

    markdownPrototype.AddFootnote = function (footnote) {
        this.footnotes[footnote.data] = footnote;
    };

    // Look up a footnote, claim it and return it's index (or -1 if not found)
    markdownPrototype.ClaimFootnote = function (id) {
        var footnote = this.footnotes[id];
        if (footnote !== undefined) {
            // Move the foot note to the used footnote list
            this.usedFootnotes.push(footnote);
            delete this.footnotes[id];

            // Return it's display index
            return this.usedFootnotes.length - 1;
        } else {
            return -1;
        }
    };

    markdownPrototype.AddAbbreviation = function (abbr, title) {
        if (this.abbreviations === null) {
            this.abbreviations = [];
        }

        // Store abbreviation
        this.abbreviations[abbr] = { Abbr: abbr, Title: title };
    };

    markdownPrototype.GetAbbreviations = function () {
        return this.abbreviations;
    };

    // private
    markdownPrototype.MakeUniqueHeaderID = function (strHeaderText, startOffset, length) {
        var base, startWithSuffix, counter;
        if (!this.AutoHeadingIDs) {
            return null;
        }

        // Extract a pandoc style cleaned header id from the header text
        base = this.spanFormatter.MakeID(strHeaderText, startOffset, length);

        // If nothing left, use "section"
        if (!base) {
            base = 'section';
        }

        // Make sure it's unique by append -n counter
        startWithSuffix = base;
        counter = 1;
        while (this.usedHeaderIDs[startWithSuffix] !== undefined) {
            startWithSuffix = base + '-' + counter.toString();
            counter++;
        }

        // Store it
        this.usedHeaderIDs[startWithSuffix] = true;

        // Return it
        return startWithSuffix;
    };

    // private
    markdownPrototype.GetStringBuilder = function () {
        this.stringBuilder.Clear();
        return this.stringBuilder;
    };

    /////////////////////////////////////////////////////////////////////////////
    // CharTypes

    function isDigit(ch) {
        return ch >= '0' && ch <= '9';
    }

    function isHex(ch) {
        return (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F');
    }

    function isAlpha(ch) {
        return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
    }

    function isAlphadigit(ch) {
        return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9');
    }

    function isWhitespace(ch) {
        return (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n');
    }

    function isLinespace(ch) {
        return (ch === ' ' || ch === '\t');
    }

    function isLineend(ch) {
        return (ch === '\r' || ch === '\n');
    }

    function isEmphasis(ch) {
        return (ch === '*' || ch === '_');
    }

    function isEscapable(ch, extraMode) {
        switch (ch) {
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
            case '>':
            case '#':
            case '+':
            case '-':
            case '.':
            case '!':
                return true;

            case ':':
            case '|':
            case '=':
            case '<':
                return extraMode;
        }

        return false;
    }

    /////////////////////////////////////////////////////////////////////////////
    // Utility functions

    // Check if str[pos] looks like a html entity
    // Returns -1 if not, or offset of character after it yes.
    function skipHtmlEntity(str, pos) {
        if (str.charAt(pos) !== '&') {
            return -1;
        }
        pos++;
        var fnTest;
        if (str.charAt(pos) === '#') {
            pos++;
            if (str.charAt(pos) === 'x' || str.charAt(pos) === 'X') {
                pos++;
                fnTest = isHex;
            }
            else {
                fnTest = isDigit;
            }
        }
        else {
            fnTest = isAlphadigit;
        }

        if (fnTest(str.charAt(pos))) {
            pos++;
            while (fnTest(str.charAt(pos))) {
                pos++;
            }
            if (str.charAt(pos) === ';') {
                pos++;
                return pos;
            }
        }

        return -1;
    }

    function unescapeString(str, extraMode) {
        // Find first backslash
        var bspos = str.indexOf('\\'), stringBuilder, piece;
        if (bspos < 0) {
            return str;
        }

        // Build new string with escapable backslashes removed
        stringBuilder = new StringBuilder();
        piece = 0;
        while (bspos >= 0) {
            if (isEscapable(str.charAt(bspos + 1), extraMode)) {
                if (bspos > piece) {
                    stringBuilder.Append(str.substr(piece, bspos - piece));
                }
                piece = bspos + 1;
            }

            bspos = str.indexOf('\\', bspos + 1);
        }

        if (piece < str.length) {
            stringBuilder.Append(str.substr(piece, str.length - piece));
        }
        return stringBuilder.ToString();
    }

    function trim(str) {
        var i = 0, l = str.length;

        while (i < l && isWhitespace(str.charAt(i))) {
            i++;
        }
        while (l - 1 > i && isWhitespace(str.charAt(l - 1))) {
            l--;
        }
        return str.substr(i, l - i);
    }

    /*
    * These two functions IsEmailAddress and IsWebAddress
    * are intended as a quick and dirty way to tell if a
    * <autolink> url is email, web address or neither.
    * They are not intended as validating checks.
    * (use of Regex for more correct test unnecessarily
    *  slowed down some test documents by up to 300%.)
    */
    // Check if a string looks like an email address
    function isEmailAddress(str) {
        var posAt = str.indexOf('@'), posLastDot;
        if (posAt < 0) {
            return false;
        }
        posLastDot = str.lastIndexOf('.');
        if (posLastDot < posAt) {
            return false;
        }
        return true;
    }

    // Check if a string looks like a url
    function isWebAddress(str) {
        str = str.toLowerCase();
        if (str.substr(0, 7) === 'http://') {
            return true;
        }
        if (str.substr(0, 8) === 'https://') {
            return true;
        }
        if (str.substr(0, 6) === 'ftp://') {
            return true;
        }
        if (str.substr(0, 7) === 'file://') {
            return true;
        }
        return false;
    }

    // Check if a string is a valid HTML ID identifier
    function isValidHtmlId(str) {
        var i, ch;
        if (!str) {
            return false;
        }

        // Must start with a letter
        if (!isAlpha(str.charAt(0))) {
            return false;
        }

        // Check the rest
        for (i = 0; i < str.length; i++) {
            ch = str.charAt(i);
            if (isAlphadigit(ch) || ch === '_' || ch === '-' || ch === ':' || ch === '.') {
                continue;
            }
            return false;
        }

        // OK
        return true;
    }

    // Strip the trailing HTML ID from a header string
    // ie:      ## header text ##			{#<idhere>}
    //			^start           ^out end              ^end
    //
    // Returns null if no header id
    function stripHtmlId(str, start, end) {
        // Skip trailing whitespace
        var pos = end - 1, endId, startId, strId;
        while (pos >= start && isWhitespace(str.charAt(pos))) {
            pos--;
        }

        // Skip closing '{'
        if (pos < start || str.charAt(pos) !== '}') {
            return null;
        }
        endId = pos;
        pos--;

        // Find the opening '{'
        while (pos >= start && str.charAt(pos) !== '{') {
            pos--;
        }

        // Check for the #
        if (pos < start || str.charAt(pos + 1) !== '#') {
            return null;
        }

        // Extract and check the ID
        startId = pos + 2;
        strId = str.substr(startId, endId - startId);
        if (!isValidHtmlId(strId)) {
            return null;
        }

        // Skip any preceeding whitespace
        while (pos > start && isWhitespace(str.charAt(pos - 1))) {
            pos--;
        }

        // Done!
        return { id: strId, end: pos };
    }

    function startsWith(str, match) {
        return str.substr(0, match.length) === match;
    }

    function endsWith(str, match) {
        return str.substr(-match.length) === match;
    }

    function isUrlFullyQualified(url) {
        return url.indexOf('://') >= 0 || startsWith(url, 'mailto:');
    }

    /////////////////////////////////////////////////////////////////////////////
    // StringBuilder

    // ReSharper disable once InconsistentNaming
    function StringBuilder() {
        this.content = [];
    }

    markdownPrototype = StringBuilder.prototype;

    markdownPrototype.Append = function (value) {
        if (value) {
            this.content.push(value);
        }
    };

    markdownPrototype.Clear = function () {
        this.content.length = 0;
    };

    markdownPrototype.ToString = function () {
        return this.content.join('');
    };

    markdownPrototype.HtmlRandomize = function (url) {
        // Randomize
        var len = url.length, i, x;
        for (i = 0; i < len; i++) {
            x = Math.random();
            if (x > 0.90 && url.charAt(i) !== '@') {
                this.Append(url.charAt(i));
            } else if (x > 0.45) {
                this.Append('&#');
                this.Append(url.charCodeAt(i).toString());
                this.Append(';');
            } else {
                this.Append('&#x');
                this.Append(url.charCodeAt(i).toString(16));
                this.Append(';');
            }
        }
    };

    markdownPrototype.HtmlEncode = function (str, startOffset, length) {
        var end = startOffset + length, piece = startOffset, i;
        for (i = startOffset; i < end; i++) {
            switch (str.charAt(i)) {
            case '&':
                if (i > piece) {
                    this.Append(str.substr(piece, i - piece));
                }
                this.Append('&amp;');
                piece = i + 1;
                break;

            case '<':
                if (i > piece) {
                    this.Append(str.substr(piece, i - piece));
                }
                this.Append('&lt;');
                piece = i + 1;
                break;

            case '>':
                if (i > piece) {
                    this.Append(str.substr(piece, i - piece));
                }
                this.Append('&gt;');
                piece = i + 1;
                break;

            case '\"':
                if (i > piece) {
                    this.Append(str.substr(piece, i - piece));
                }
                this.Append('&quot;');
                piece = i + 1;
                break;
            }
        }

        if (i > piece) {
            this.Append(str.substr(piece, i - piece));
        }
    };

    markdownPrototype.SmartHtmlEncodeAmpsAndAngles = function (str, startOffset, length) {
        var end = startOffset + length, piece = startOffset, i, after;
        for (i = startOffset; i < end; i++) {
            switch (str.charAt(i)) {
            case '&':
                after = skipHtmlEntity(str, i);
                if (after < 0) {
                    if (i > piece) {
                        this.Append(str.substr(piece, i - piece));
                    }
                    this.Append('&amp;');
                    piece = i + 1;
                } else {
                    i = after - 1;
                }
                break;

            case '<':
                if (i > piece) {
                    this.Append(str.substr(piece, i - piece));
                }
                this.Append('&lt;');
                piece = i + 1;
                break;

            case '>':
                if (i > piece) {
                    this.Append(str.substr(piece, i - piece));
                }
                this.Append('&gt;');
                piece = i + 1;
                break;

            case '\"':
                if (i > piece) {
                    this.Append(str.substr(piece, i - piece));
                }
                this.Append('&quot;');
                piece = i + 1;
                break;
            }
        }

        if (i > piece) {
            this.Append(str.substr(piece, i - piece));
        }
    };

    markdownPrototype.SmartHtmlEncodeAmps = function (str, startOffset, length) {
        var end = startOffset + length, piece = startOffset, i, after;
        for (i = startOffset; i < end; i++) {
            switch (str.charAt(i)) {
            case '&':
                after = skipHtmlEntity(str, i);
                if (after < 0) {
                    if (i > piece) {
                        this.Append(str.substr(piece, i - piece));
                    }
                    this.Append('&amp;');
                    piece = i + 1;
                } else {
                    i = after - 1;
                }
                break;
            }
        }

        if (i > piece) {
            this.Append(str.substr(piece, i - piece));
        }
    };

    markdownPrototype.HtmlEncodeAndConvertTabsToSpaces = function (str, startOffset, length) {
        var end = startOffset + length, piece = startOffset, pos = 0, i;
        for (i = startOffset; i < end; i++) {
            switch (str.charAt(i)) {
            case '\t':
                if (i > piece) {
                    this.Append(str.substr(piece, i - piece));
                }
                piece = i + 1;

                this.Append(' ');
                pos++;
                while ((pos % 4) !== 0) {
                    this.Append(' ');
                    pos++;
                }
                pos--; // Compensate for the pos++ below
                break;
            case '\r':
            case '\n':
                if (i > piece) {
                    this.Append(str.substr(piece, i - piece));
                }
                this.Append('\n');
                piece = i + 1;
                continue;
            case '&':
                if (i > piece) {
                    this.Append(str.substr(piece, i - piece));
                }
                this.Append('&amp;');
                piece = i + 1;
                break;
            case '<':
                if (i > piece) {
                    this.Append(str.substr(piece, i - piece));
                }
                this.Append('&lt;');
                piece = i + 1;
                break;
            case '>':
                if (i > piece) {
                    this.Append(str.substr(piece, i - piece));
                }
                this.Append('&gt;');
                piece = i + 1;
                break;
            case '\"':
                if (i > piece) {
                    this.Append(str.substr(piece, i - piece));
                }
                this.Append('&quot;');
                piece = i + 1;
                break;
            }

            pos++;
        }

        if (i > piece) {
            this.Append(str.substr(piece, i - piece));
        }
    };

    /////////////////////////////////////////////////////////////////////////////
    // StringScanner

    // ReSharper disable once InconsistentNaming
    function StringScanner() {
        this.reset.apply(this, arguments);
    }

    markdownPrototype = StringScanner.prototype;

    markdownPrototype.bof = function () {
        return this.position === this.start;
    };

    markdownPrototype.eof = function () {
        return this.position >= this.end;
    };

    markdownPrototype.eol = function () {
        if (this.position >= this.end) {
            return true;
        }
        var ch = this.buf.charAt(this.position);
        return ch === '\r' || ch === '\n' || ch === undefined || ch === '';
    };

    markdownPrototype.reset = function (/*string, position, length*/) {
        this.buf = arguments.length > 0 ? arguments[0] : null;
        this.start = arguments.length > 1 ? arguments[1] : 0;
        this.end = arguments.length > 2 ? this.start + arguments[2] : (this.buf === null ? 0 : this.buf.length);
        this.position = this.start;
        this.charsetOffsets = {};
    };

    markdownPrototype.current = function () {
        if (this.position >= this.end) {
            return '\0';
        }
        return this.buf.charAt(this.position);
    };

    markdownPrototype.remainder = function () {
        return this.buf.substr(this.position);
    };

    markdownPrototype.SkipToEof = function () {
        this.position = this.end;
    };

    markdownPrototype.SkipForward = function (count) {
        this.position += count;
    };

    markdownPrototype.SkipToEol = function () {
        this.position = this.buf.indexOf('\n', this.position);
        if (this.position < 0) {
            this.position = this.end;
        }
    };

    markdownPrototype.SkipEol = function () {
        var save = this.position;
        if (this.buf.charAt(this.position) === '\r') {
            this.position++;
        }
        if (this.buf.charAt(this.position) === '\n') {
            this.position++;
        }
        return this.position !== save;
    };

    markdownPrototype.SkipToNextLine = function () {
        this.SkipToEol();
        this.SkipEol();
    };

    markdownPrototype.CharAtOffset = function (offset) {
        if (this.position + offset >= this.end) {
            return '\0';
        }
        return this.buf.charAt(this.position + offset);
    };

    markdownPrototype.SkipChar = function (ch) {
        if (this.buf.charAt(this.position) === ch) {
            this.position++;
            return true;
        }
        return false;
    };

    markdownPrototype.SkipString = function (s) {
        if (this.buf.substr(this.position, s.length) === s) {
            this.position += s.length;
            return true;
        }
        return false;
    };

    markdownPrototype.SkipWhitespace = function () {
        var save = this.position, ch;
        while (true) {
            ch = this.buf.charAt(this.position);
            //TODO can't I just call the linespace function here?
            if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') {
                break;
            }
            this.position++;
        }
        return this.position !== save;
    };

    markdownPrototype.SkipLinespace = function () {
        var save = this.position, ch;
        while (true) {
            ch = this.buf.charAt(this.position);
            if (ch !== ' ' && ch !== '\t') {
                break;
            }
            this.position++;
        }
        return this.position !== save;
    };

    markdownPrototype.FindRE = function (re) {
        re.lastIndex = this.position;
        var result = re.exec(this.buf);
        if (result === undefined || result === null) {
            this.position = this.end;
            return false;
        }

        if (result.index + result[0].length > this.end) {
            this.position = this.end;
            return false;
        }

        this.position = result.index;
        return true;
    };

    markdownPrototype.FindOneOf = function (charset) {
        var next = -1, ch, charsetInfo;
        for (ch in charset) {
            if (charset.hasOwnProperty(ch)) {
                charsetInfo = charset[ch];

                // Setup charset_info for this character
                if (charsetInfo === undefined || charsetInfo === null) {
                    charsetInfo = {};
                    charsetInfo.searchedFrom = -1;
                    charsetInfo.foundAt = -1;
                    charset[ch] = charsetInfo;
                }

                // Search again?
                if (charsetInfo.searchedFrom === -1 ||
                    this.position < charsetInfo.searchedFrom ||
                    (this.position >= charsetInfo.foundAt && charsetInfo.foundAt !== -1)) {
                    charsetInfo.searchedFrom = this.position;
                    charsetInfo.foundAt = this.buf.indexOf(ch, this.position);
                }

                // Is this character next?
                if (next === -1 || charsetInfo.foundAt < next) {
                    next = charsetInfo.foundAt;
                }
            }
        }

        if (next === -1) {
            return false;
        }

        markdownPrototype.position = next;
        return true;
    };

    markdownPrototype.Find = function (s) {
        this.position = this.buf.indexOf(s, this.position);
        if (this.position < 0) {
            this.position = this.end;
            return false;
        }
        return true;
    };

    markdownPrototype.Mark = function () {
        this.mark = this.position;
    };

    markdownPrototype.Extract = function () {
        if (this.mark >= this.position) {
            return '';
        } else {
            return this.buf.substr(this.mark, this.position - this.mark);
        }
    };

    markdownPrototype.SkipIdentifier = function () {
        var ch = this.buf.charAt(this.position);
        if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
            this.position++;
            while (true) {
                ch = this.buf.charAt(this.position);
                if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || (ch >= '0' && ch <= '9')) {
                    this.position++;
                } else {
                    return true;
                }
            }
        }
        return false;
    };

    markdownPrototype.SkipFootnoteID = function () {
        var savepos = this.position, ch, id;

        this.SkipLinespace();

        this.Mark();

        while (true) {
            ch = this.current();
            if (isAlphadigit(ch) || ch === '-' || ch === '_' || ch === ':' || ch === '.' || ch === ' ') {
                this.SkipForward(1);
            } else {
                break;
            }
        }

        if (this.position > this.mark) {
            id = trim(this.Extract());
            if (id.length > 0) {
                this.SkipLinespace();
                return id;
            }
        }

        this.position = savepos;
        return null;
    };

    markdownPrototype.SkipHtmlEntity = function () {
        if (this.buf.charAt(this.position) !== '&') {
            return false;
        }
        var newpos = skipHtmlEntity(this.buf, this.position);
        if (newpos < 0) {
            return false;
        }
        this.position = newpos;
        return true;
    };

    markdownPrototype.SkipEscapableChar = function (extraMode) {
        if (this.buf.charAt(this.position) === '\\' && isEscapable(this.buf.charAt(this.position + 1), extraMode)) {
            this.position += 2;
            return true;
        } else {
            if (this.position < this.end) {
                this.position++;
            }
            return false;
        }
    };

    /////////////////////////////////////////////////////////////////////////////
    // HtmlTag

    // ReSharper disable once InconsistentNaming
    function HtmlTag(name) {
        this.name = name;
        this.attributes = {};
        this.flags = 0;
        this.closed = false;
        this.closing = false;
    }

    markdownPrototype = HtmlTag.prototype;

    markdownPrototype.AttributeCount = function () {
        var attributes = this.attributes, count, x;
        if (!attributes) {
            return 0;
        }
        count = 0;
        for (x in attributes) {
            if (attributes.hasOwnProperty(x)) {
                count++;
            }
        }
        return count;
    };

    markdownPrototype.GetFlags = function () {
        if (this.flags === 0) {
            this.flags = tagFlags[this.name.toLowerCase()];
            if (this.flags === undefined) {
                this.flags = htmlTagFlagsInline;
            }
        }
        return this.flags;
    };

    markdownPrototype.IsSafe = function () {
        var nameLower = this.name.toLowerCase(), allowed, attributes, i;

        // Check if tag is in whitelist
        if (!allowedTags[nameLower]) {
            return false;
        }

        // Find allowed attributes
        allowed = allowedAttributes[nameLower];
        if (!allowed) {
            return this.AttributeCount() === 0;
        }

        // No attributes?
        attributes = this.attributes;
        if (!attributes) {
            return true;
        }

        // Check all are allowed
        for (i in attributes) {
            if (attributes.hasOwnProperty(i)) {
                if (!allowed[i.toLowerCase()]) {
                    return false;
                }
            }
        }

        // Check href attribute is ok
        if (attributes['href']) {
            if (!isSafeUrl(attributes['href'])) {
                return false;
            }
        }

        if (attributes['src']) {
            if (!isSafeUrl(attributes['src'])) {
                return false;
            }
        }

        // Passed all white list checks, allow it
        return true;
    };

    // Render opening tag (eg: <tag attr="value">
    markdownPrototype.RenderOpening = function (dest) {
        dest.Append('<');
        dest.Append(this.name);
        var attributes = this.attributes, i;
        for (i in attributes) {
            if (attributes.hasOwnProperty(i)) {
                dest.Append(' ');
                dest.Append(i);
                dest.Append('="');
                dest.Append(attributes[i]);
                dest.Append('"');
            }
        }

        if (this.closed) {
            dest.Append(' />');
        } else {
            dest.Append('>');
        }
    };

    // Render closing tag (eg: </tag>)
    markdownPrototype.RenderClosing = function (dest) {
        dest.Append('</');
        dest.Append(this.name);
        dest.Append('>');
    };

    function isSafeUrl(url) {
        url = url.toLowerCase();
        return (url.substr(0, 7) === 'http://' ||
                url.substr(0, 8) === 'https://' ||
                url.substr(0, 6) === 'ftp://');
    }

    function parseHtmlTag(p) {
        // Save position
        var savepos = p.position, ret;

        // Parse it
        ret = parseHtmlTagHelper(p);
        if (ret !== null) {
            return ret;
        }

        // Rewind if failed
        p.position = savepos;
        return null;
    }

    function parseHtmlTagHelper(p) {
        var closing, tag, attributeName, t;
        // Does it look like a tag?
        if (p.current() !== '<') {
            return null;
        }

        // Skip '<'
        p.SkipForward(1);

        // Is it a comment?
        if (p.SkipString('!--')) {
            p.Mark();

            if (p.Find('-->')) {
                t = new HtmlTag('!');
                t.attributes['content'] = p.Extract();
                t.closed = true;
                p.SkipForward(3);
                return t;
            }
        }

        // Is it a closing tag eg: </div>
        closing = p.SkipChar('/');

        // Get the tag name
        p.Mark();
        if (!p.SkipIdentifier()) {
            return null;
        }

        // Probably a tag, create the HtmlTag object now
        tag = new HtmlTag(p.Extract());
        tag.closing = closing;

        // If it's a closing tag, no attributes
        if (closing) {
            if (p.current() !== '>') {
                return null;
            }
            p.SkipForward(1);
            return tag;
        }

        while (!p.eof()) {
            // Skip whitespace
            p.SkipWhitespace();

            // Check for closed tag eg: <hr />
            if (p.SkipString('/>')) {
                tag.closed = true;
                return tag;
            }

            // End of tag?
            if (p.SkipChar('>')) {
                return tag;
            }

            // attribute name
            p.Mark();
            if (!p.SkipIdentifier()) {
                return null;
            }
            attributeName = p.Extract();

            // Skip whitespace
            p.SkipWhitespace();

            // Skip equal sign
            if (p.SkipChar('=')) {
                // Skip whitespace
                p.SkipWhitespace();

                // Optional quotes
                if (p.SkipChar('\"')) {
                    // Scan the value
                    p.Mark();
                    if (!p.Find('\"')) {
                        return null;
                    }

                    // Store the value
                    tag.attributes[attributeName] = p.Extract();

                    // Skip closing quote
                    p.SkipForward(1);
                }
                else {
                    // Scan the value
                    p.Mark();
                    while (!p.eof() && !isWhitespace(p.current()) && p.current() !== '>' && p.current() !== '/') {
                        p.SkipForward(1);
                    }
                    if (!p.eof()) {
                        // Store the value
                        tag.attributes[attributeName] = p.Extract();
                    }
                }
            }
            else {
                tag.attributes[attributeName] = '';
            }
        }

        return null;
    }

    allowedTags = {
        'b': 1, 'blockquote': 1, 'code': 1, 'dd': 1, 'dt': 1, 'dl': 1, 'del': 1, 'em': 1,
        'h1': 1, 'h2': 1, 'h3': 1, 'h4': 1, 'h5': 1, 'h6': 1, 'i': 1, 'kbd': 1, 'li': 1, 'ol': 1, 'ul': 1,
        'p': 1, 'pre': 1, 's': 1, 'sub': 1, 'sup': 1, 'strong': 1, 'strike': 1, 'img': 1, 'a': 1
    };
    allowedAttributes = {
        'a': { 'href': 1, 'title': 1, 'class': 1 },
        'img': { 'src': 1, 'width': 1, 'height': 1, 'alt': 1, 'title': 1, 'class': 1 }
    };
    tagFlags = {
        'p': tagFlagsBlock | tagFlagsContentAsSpan,
        'div': tagFlagsBlock,
        'h1': tagFlagsBlock | tagFlagsContentAsSpan,
        'h2': tagFlagsBlock | tagFlagsContentAsSpan,
        'h3': tagFlagsBlock | tagFlagsContentAsSpan,
        'h4': tagFlagsBlock | tagFlagsContentAsSpan,
        'h5': tagFlagsBlock | tagFlagsContentAsSpan,
        'h6': tagFlagsBlock | tagFlagsContentAsSpan,
        'blockquote': tagFlagsBlock,
        'pre': tagFlagsBlock,
        'table': tagFlagsBlock,
        'dl': tagFlagsBlock,
        'ol': tagFlagsBlock,
        'ul': tagFlagsBlock,
        'form': tagFlagsBlock,
        'fieldset': tagFlagsBlock,
        'iframe': tagFlagsBlock,
        'script': tagFlagsBlock | tagFlagsInline,
        'noscript': tagFlagsBlock | tagFlagsInline,
        'math': tagFlagsBlock | tagFlagsInline,
        'ins': tagFlagsBlock | tagFlagsInline,
        'del': tagFlagsBlock | tagFlagsInline,
        'img': tagFlagsBlock | tagFlagsInline,
        'li': tagFlagsContentAsSpan,
        'dd': tagFlagsContentAsSpan,
        'dt': tagFlagsContentAsSpan,
        'td': tagFlagsContentAsSpan,
        'th': tagFlagsContentAsSpan,
        'legend': tagFlagsContentAsSpan,
        'address': tagFlagsContentAsSpan,
        'hr': tagFlagsBlock | tagFlagsNoClosing,
        '!': tagFlagsBlock | tagFlagsNoClosing,
        'head': tagFlagsBlock
    };

    /////////////////////////////////////////////////////////////////////////////
    // LinkDefinition

    // ReSharper disable once InconsistentNaming
    function LinkDefinition(id, url, title) {
        this.id = id;
        this.url = url;
        if (title === undefined) {
            this.title = null;
        } else {
            this.title = title;
        }
    }

    markdownPrototype = LinkDefinition.prototype;

    markdownPrototype.RenderLink = function (m, b, linkText) {
        var tag, stringBuilder;
        if (this.url.substr(0, 7).toLowerCase() === 'mailto:') {
            b.Append('<a href="');
            b.HtmlRandomize(this.url);
            b.Append('\"');
            if (this.title) {
                b.Append(' title="');
                b.SmartHtmlEncodeAmpsAndAngles(this.title, 0, this.title.length);
                b.Append('\"');
            }
            b.Append('>');
            b.HtmlRandomize(linkText);
            b.Append('</a>');
        } else {
            tag = new HtmlTag('a');

            // encode url
            stringBuilder = m.GetStringBuilder();
            stringBuilder.SmartHtmlEncodeAmpsAndAngles(this.url, 0, this.url.length);
            tag.attributes['href'] = stringBuilder.ToString();

            // encode title
            if (this.title) {
                stringBuilder.Clear();
                stringBuilder.SmartHtmlEncodeAmpsAndAngles(this.title, 0, this.title.length);
                tag.attributes['title'] = stringBuilder.ToString();
            }

            // Do user processing
            m.OnPrepareLink(tag);

            // Render the opening tag
            tag.RenderOpening(b);

            b.Append(linkText); // Link text already escaped by SpanFormatter
            b.Append('</a>');
        }
    };

    markdownPrototype.RenderImg = function (m, b, altText) {
        var tag = new HtmlTag('img'), sb;

        // encode url
        sb = m.GetStringBuilder();
        sb.SmartHtmlEncodeAmpsAndAngles(this.url, 0, this.url.length);
        tag.attributes['src'] = sb.ToString();

        // encode alt text
        if (altText) {
            sb.Clear();
            sb.SmartHtmlEncodeAmpsAndAngles(altText, 0, altText.length);
            tag.attributes['alt'] = sb.ToString();
        }

        // encode title
        if (this.title) {
            sb.Clear();
            sb.SmartHtmlEncodeAmpsAndAngles(this.title, 0, this.title.length);
            tag.attributes['title'] = sb.ToString();
        }

        tag.closed = true;

        m.OnPrepareImage(tag, m.RenderingTitledImage);

        tag.RenderOpening(b);
    };

    function parseLinkDefinition(p, extraMode) {
        var savepos = p.position, l;
        l = parseLinkDefinitionInternal(p, extraMode);
        if (l === null) {
            p.position = savepos;
        }
        return l;
    }

    function parseLinkDefinitionInternal(p, extraMode) {
        var id, link;
        // Skip leading white space
        p.SkipWhitespace();

        // Must start with an opening square bracket
        if (!p.SkipChar('[')) {
            return null;
        }

        // Extract the id
        p.Mark();
        if (!p.Find(']')) {
            return null;
        }
        id = p.Extract();
        if (id.length === 0) {
            return null;
        }
        if (!p.SkipString(']:')) {
            return null;
        }

        // Parse the url and title
        link = parseLinkTarget(p, id, extraMode);

        // and trailing whitespace
        p.SkipLinespace();

        // Trailing stuff, not a valid link reference...
        if (!p.eol()) {
            return null;
        }
        return link;
    }

    // Parse just the link target
    // For reference link definition, this is the bit after "[id]: thisbit"
    // For inline link, this is the bit in the parens: [link text](thisbit)
    function parseLinkTarget(p, id, extraMode) {
        var r, url, parentDepth, onNewLine, posLineEnd, delim, savepos, ch;
        // Skip whitespace
        p.SkipWhitespace();

        // End of string?
        if (p.eol()) {
            return null;
        }

        // Create the link definition
        r = new LinkDefinition(id);

        // Is the url enclosed in angle brackets
        if (p.SkipChar('<')) {
            // Extract the url
            p.Mark();

            // Find end of the url
            while (p.current() !== '>') {
                if (p.eof()) {
                    return null;
                }
                p.SkipEscapableChar(extraMode);
            }

            url = p.Extract();
            if (!p.SkipChar('>')) {
                return null;
            }

            // Unescape it
            r.url = unescapeString(trim(url), extraMode);

            // Skip whitespace
            p.SkipWhitespace();
        }
        else {
            // Find end of the url
            p.Mark();
            parentDepth = 1;
            while (!p.eol()) {
                ch = p.current();
                if (isWhitespace(ch)) {
                    break;
                }
                if (id === null) {
                    if (ch === '(') {
                        parentDepth++;
                    } else if (ch === ')') {
                        parentDepth--;
                        if (parentDepth === 0) {
                            break;
                        }
                    }
                }

                p.SkipEscapableChar(extraMode);
            }

            r.url = unescapeString(trim(p.Extract()), extraMode);
        }

        p.SkipLinespace();

        // End of inline target
        if (p.current() === ')') {
            return r;
        }
        onNewLine = p.eol();
        posLineEnd = p.position;
        if (p.eol()) {
            p.SkipEol();
            p.SkipLinespace();
        }

        // Work out what the title is delimited with
        switch (p.current()) {
            case '\'':
            case '\"':
                delim = p.current();
                break;

            case '(':
                delim = ')';
                break;
            default:
                if (onNewLine) {
                    p.position = posLineEnd;
                    return r;
                }
                else {
                    return null;
                }
        }

        // Skip the opening title delimiter
        p.SkipForward(1);

        // Find the end of the title
        p.Mark();
        while (true) {
            if (p.eol()) {
                return null;
            }
            if (p.current() === delim) {
                if (delim !== ')') {
                    savepos = p.position;

                    // Check for embedded quotes in title

                    // Skip the quote and any trailing whitespace
                    p.SkipForward(1);
                    p.SkipLinespace();

                    // Next we expect either the end of the line for a link definition
                    // or the close bracket for an inline link
                    if ((id === null && p.current() !== ')') || (id !== null && !p.eol())) {
                        continue;
                    }

                    p.position = savepos;
                }

                // End of title
                break;
            }

            p.SkipEscapableChar(extraMode);
        }

        // Store the title
        r.title = unescapeString(p.Extract(), extraMode);

        // Skip closing quote
        p.SkipForward(1);

        // Done!
        return r;
    }

    /////////////////////////////////////////////////////////////////////////////
    // LinkInfo

    // ReSharper disable once InconsistentNaming
    function LinkInfo(def, linkText) {
        this.def = def;
        this.linkText = linkText;
    }

    /////////////////////////////////////////////////////////////////////////////
    // Token

    // ReSharper disable once InconsistentNaming
    function Token(type, startOffset, length) {
        this.type = type;
        this.startOffset = startOffset;
        this.length = length;
        this.data = null;
    }

    /////////////////////////////////////////////////////////////////////////////
    // SpanFormatter
    // ReSharper disable once InconsistentNaming
    function SpanFormatter(markdown) {
        this.markdown = markdown;
        this.scanner = new StringScanner();
        this.spareTokens = [];
        this.disableLinks = false;
        this.tokens = [];
    }

    markdownPrototype = SpanFormatter.prototype;

    markdownPrototype.FormatParagraph = function (dest, str, start, len) {
        // Parse the string into a list of tokens
        this.Tokenize(str, start, len);

        // Titled image?
        if (this.tokens.length === 1 &&
            this.markdown.HtmlClassTitledImages !== null &&
            this.tokens[0].type === tokenTypeImg) {
            // Grab the link info
            var li = this.tokens[0].data;

            // Render the div opening
            dest.Append('<div class="');
            dest.Append(this.markdown.HtmlClassTitledImages);
            dest.Append('">\n');

            // Render the img
            this.markdown.RenderingTitledImage = true;
            this.Render(dest, str);
            this.markdown.RenderingTitledImage = false;
            dest.Append('\n');

            // Render the title
            if (li.def.title) {
                dest.Append('<p>');
                dest.SmartHtmlEncodeAmpsAndAngles(li.def.title, 0, li.def.title.length);
                dest.Append('</p>\n');
            }

            dest.Append('</div>\n');
        } else {
            // Render the paragraph
            dest.Append('<p>');
            this.Render(dest, str);
            dest.Append('</p>\n');
        }
    };

    // Format part of a string into a destination string builder
    markdownPrototype.Format2 = function (dest, str) {
        this.Format(dest, str, 0, str.length);
    };

    // Format part of a string into a destination string builder
    markdownPrototype.Format = function (dest, str, start, len) {
        // Parse the string into a list of tokens
        this.Tokenize(str, start, len);

        // Render all tokens
        this.Render(dest, str);
    };

    // Format a string and return it as a new string
    // (used in formatting the text of links)
    markdownPrototype.FormatDirect = function (str) {
        var dest = new StringBuilder();
        this.Format(dest, str, 0, str.length);
        return dest.ToString();
    };

    markdownPrototype.MakeID = function (str, start, len) {
        // Parse the string into a list of tokens
        this.Tokenize(str, start, len);
        var tokens = this.tokens, i, token, p, ch, stringBuilder;

        stringBuilder = new StringBuilder();
        for (i = 0; i < tokens.length; i++) {
            token = tokens[i];
            switch (token.type) {
            case tokenTypeText:
                stringBuilder.Append(str.substr(token.startOffset, token.length));
                break;

            case tokenTypeLink:
                stringBuilder.Append(token.data.linkText);
                break;
            }
            this.FreeToken(token);
        }

        // Now clean it using the same rules as pandoc
        p = this.scanner;
        p.reset(stringBuilder.ToString());

        // Skip everything up to the first letter
        while (!p.eof()) {
            if (isAlpha(p.current())) {
                break;
            }
            p.SkipForward(1);
        }

        // Process all characters
        stringBuilder.Clear();
        while (!p.eof()) {
            ch = p.current();
            if (isAlphadigit(ch) || ch === '_' || ch === '-' || ch === '.') {
                stringBuilder.Append(ch.toLowerCase());
            } else if (ch === ' ') {
                stringBuilder.Append('-');
            } else if (isLineend(ch)) {
                stringBuilder.Append('-');
                p.SkipEol();
                continue;
            }

            p.SkipForward(1);
        }

        return stringBuilder.ToString();
    };

    // Render a list of tokens to a destination string builder.
    markdownPrototype.Render = function (sb, str) {
        var tokens = this.tokens, len, i, t, li, sf, r;
        len = tokens.length;
        for (i = 0; i < len; i++) {
            t = tokens[i];
            li = t.data;
            switch (t.type) {
            case tokenTypeText:
                // Append encoded text
                sb.HtmlEncode(str, t.startOffset, t.length);
                break;
            case tokenTypeHtmlTag:
                // Append html as is
                sb.SmartHtmlEncodeAmps(str, t.startOffset, t.length);
                break;
            case tokenTypeHtml:
            case tokenTypeOpeningMark:
            case tokenTypeClosingMark:
            case tokenTypeInternalMark:
                // Append html as is
                sb.Append(str.substr(t.startOffset, t.length));
                break;
            case tokenTypeBr:
                sb.Append('<br />\n');
                break;
            case tokenTypeOpenEm:
                sb.Append('<em>');
                break;
            case tokenTypeCloseEm:
                sb.Append('</em>');
                break;
            case tokenTypeOpenStrong:
                sb.Append('<strong>');
                break;
            case tokenTypeCloseStrong:
                sb.Append('</strong>');
                break;
            case tokenTypeCodeSpan:
                sb.Append('<pre><code>');
                sb.HtmlEncode(str, t.startOffset, t.length);
                sb.Append('</code></pre>');
                break;
            case tokenTypeLink:
                sf = new SpanFormatter(this.markdown);
                sf.disableLinks = true;
                li.def.RenderLink(this.markdown, sb, sf.FormatDirect(li.linkText));
                break;
            case tokenTypeImg:
                li.def.RenderImg(this.markdown, sb, li.linkText);
                break;
            case tokenTypeFootnote:
                r = t.data;
                sb.Append('<sup id="fnref:');
                sb.Append(r.id);
                sb.Append('"><a href="#fn:');
                sb.Append(r.id);
                sb.Append('" rel="footnote">');
                sb.Append(r.index + 1);
                sb.Append('</a></sup>');
                break;
            case tokenTypeAbbreviation:
                sb.Append('<abbr');
                if (li.Title) {
                    sb.Append(' title="');
                    sb.HtmlEncode(li.Title, 0, li.Title.length);
                    sb.Append('"');
                }
                sb.Append('>');
                sb.HtmlEncode(li.Abbr, 0, li.Abbr.length);
                sb.Append('</abbr>');
                break;
            }

            this.FreeToken(t);
        }
    };

    markdownPrototype.Tokenize = function (str, start, len) {
        // Reset the string scanner
        var p = this.scanner,
            tokens,
            emphasisMarks,
            abbreviations,
            re = null,
            extraMode,
            startTextToken,
            endTextToken,
            token,
            save,
            linkpos,
            tag,
            savepos,
            i,
            abbr;
        p.reset(str, start, len);

        tokens = this.tokens;
        tokens.length = 0;

        emphasisMarks = null;
        abbreviations = this.markdown.GetAbbreviations();

        if (abbreviations === null) {
            re = /[\*\_\`\[\!<\&\ \\]/g;
        }

        extraMode = this.markdown.ExtraMode;

        // Scan string
        startTextToken = p.position;
        while (!p.eof()) {
            if (re !== null && !p.FindRE(re)) {
                break;
            }
            endTextToken = p.position;

            // Work out token
            token = null;
            switch (p.current()) {
            case '*':
            case '_':
                // Create emphasis mark
                token = this.CreateEmphasisMark();

                if (token !== null) {
                    // Store marks in a separate list the we'll resolve later
                    switch (token.type) {
                    case tokenTypeInternalMark:
                    case tokenTypeOpeningMark:
                    case tokenTypeClosingMark:
                        if (emphasisMarks === null) {
                            emphasisMarks = [];
                        }
                        emphasisMarks.push(token);
                        break;
                    }
                }
                break;
            case '`':
                token = this.ProcessCodeSpan();
                break;
            case '[':
            case '!':
                // Process link reference
                linkpos = p.position;
                token = this.ProcessLinkOrImageOrFootnote();

                // Rewind if invalid syntax
                // (the '[' or '!' will be treated as a regular character and processed below)
                if (token === null) {
                    p.position = linkpos;
                }
                break;
            case '<':
                // Is it a valid html tag?
                save = p.position;
                tag = parseHtmlTag(p);
                if (tag !== null) {
                    // Yes, create a token for it
                    if (!this.markdown.SafeMode || tag.IsSafe()) {
                        // Yes, create a token for it
                        token = this.CreateToken(tokenTypeHtmlTag, save, p.position - save);
                    } else {
                        // No, rewrite and encode it
                        p.position = save;
                    }
                } else {
                    // No, rewind and check if it's a valid autolink eg: <google.com>
                    p.position = save;
                    token = this.ProcessAutoLink();

                    if (token === null) {
                        p.position = save;
                    }
                }
                break;
            case '&':
                // Is it a valid html entity
                save = p.position;
                if (p.SkipHtmlEntity()) {
                    // Yes, create a token for it
                    token = this.CreateToken(tokenTypeHtml, save, p.position - save);
                }
                break;
            case ' ':
                // Check for double space at end of a line
                if (p.CharAtOffset(1) === ' ' && isLineend(p.CharAtOffset(2))) {
                    // Yes, skip it
                    p.SkipForward(2);

                    // Don't put br's at the end of a paragraph
                    if (!p.eof()) {
                        p.SkipEol();
                        token = this.CreateToken(tokenTypeBr, endTextToken, 0);
                    }
                }
                break;
            case '\\':
                // Check followed by an escapable character
                if (isEscapable(p.CharAtOffset(1), extraMode)) {
                    token = this.CreateToken(tokenTypeText, p.position + 1, 1);
                    p.SkipForward(2);
                }
                break;
            }

            // Look for abbreviations.
            if (token === null && abbreviations !== null && !isAlphadigit(p.CharAtOffset(-1))) {
                savepos = p.position;
                for (i in abbreviations) {
                    if (abbreviations.hasOwnProperty(i)) {
                        abbr = abbreviations[i];
                        if (p.SkipString(abbr.Abbr) && !isAlphadigit(p.current())) {
                            token = this.CreateDataToken(tokenTypeAbbreviation, abbr);
                            break;
                        }
                        p.position = savepos;
                    }
                }
            }

            // If token found, append any preceeding text and the new token to the token list
            if (token !== null) {
                // Create a token for everything up to the special character
                if (endTextToken > startTextToken) {
                    tokens.push(this.CreateToken(tokenTypeText, startTextToken, endTextToken - startTextToken));
                }

                // Add the new token
                tokens.push(token);

                // Remember where the next text token starts
                startTextToken = p.position;
            } else {
                // Skip a single character and keep looking
                p.SkipForward(1);
            }
        }

        // Append a token for any trailing text after the last token.
        if (p.position > startTextToken) {
            tokens.push(this.CreateToken(tokenTypeText, startTextToken, p.position - startTextToken));
        }

        // Do we need to resolve and emphasis marks?
        if (emphasisMarks !== null) {
            this.ResolveEmphasisMarks(tokens, emphasisMarks);
        }
    };

    /*
    * Resolving emphasis tokens is a two part process
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
    markdownPrototype.CreateEmphasisMark = function () {
        var p = this.scanner, ch = p.current(), savepos = p.position, spaceBefore, count, spaceAfter;
        // Check for a consecutive sequence of just '_' and '*'
        if (p.bof() || isWhitespace(p.CharAtOffset(-1))) {
            while (isEmphasis(p.current())) {
                p.SkipForward(1);
            }
            if (p.eof() || isWhitespace(p.current())) {
                return this.CreateToken(tokenTypeHtml, savepos, p.position - savepos);
            }

            // Rewind
            p.position = savepos;
        }

        // Scan backwards and see if we have space before
        while (isEmphasis(p.CharAtOffset(-1))) {
            p.SkipForward(-1);
        }
        spaceBefore = p.bof() || isWhitespace(p.CharAtOffset(-1));
        p.position = savepos;

        // Count how many matching emphasis characters
        while (p.current() === ch) {
            p.SkipForward(1);
        }
        count = p.position - savepos;

        // Scan forwards and see if we have space after
        while (isEmphasis(p.CharAtOffset(1))) {
            p.SkipForward(1);
        }
        spaceAfter = p.eof() || isWhitespace(p.current());
        p.position = savepos + count;

        if (spaceBefore) {
            return this.CreateToken(tokenTypeOpeningMark, savepos, p.position - savepos);
        }

        if (spaceAfter) {
            return this.CreateToken(tokenTypeClosingMark, savepos, p.position - savepos);
        }

        if (this.markdown.ExtraMode && ch === '_' && isAlphadigit(p.current())) {
            return null;
        }
        return this.CreateToken(tokenTypeInternalMark, savepos, p.position - savepos);
    };

    // Split mark token
    markdownPrototype.SplitMarkToken = function (tokens, marks, token, position) {
        // Create the new rhs token
        var tokenRhs = this.CreateToken(token.type, token.startOffset + position, token.length - position);

        // Adjust down the length of this token
        token.length = position;

        // Insert the new token into each of the parent collections
        marks.splice(arrayIndexOf(marks, token) + 1, 0, tokenRhs);
        tokens.splice(arrayIndexOf(tokens, token) + 1, 0, tokenRhs);

        // Return the new token
        return tokenRhs;
    };

    // Resolve emphasis marks (part 2)
    markdownPrototype.ResolveEmphasisMarks = function (tokens, marks) {
        var input = this.scanner.buf, bContinue = true, i, openingMark, j, closingMark, style;

        while (bContinue) {
            bContinue = false;
            for (i = 0; i < marks.length; i++) {
                // Get the next opening or internal mark
                openingMark = marks[i];
                if (openingMark.type !== tokenTypeOpeningMark && openingMark.type !== tokenTypeInternalMark) {
                    continue;
                }

                // Look for a matching closing mark
                for (j = i + 1; j < marks.length; j++) {
                    // Get the next closing or internal mark
                    closingMark = marks[j];
                    if (closingMark.type !== tokenTypeClosingMark && closingMark.type !== tokenTypeInternalMark) {
                        break;
                    }

                    // Ignore if different type (ie: `*` vs `_`)
                    if (input.charAt(openingMark.startOffset) !== input.charAt(closingMark.startOffset)) {
                        continue;
                    }

                    // strong or em?
                    style = Math.min(openingMark.length, closingMark.length);

                    // Triple or more on both ends?
                    if (style >= 3) {
                        style = (style % 2) === 1 ? 1 : 2;
                    }

                    // Split the opening mark, keeping the RHS
                    if (openingMark.length > style) {
                        openingMark = this.SplitMarkToken(tokens, marks, openingMark, openingMark.length - style);
                        i--;
                    }

                    // Split the closing mark, keeping the LHS
                    if (closingMark.length > style) {
                        this.SplitMarkToken(tokens, marks, closingMark, style);
                    }

                    // Connect them
                    openingMark.type = style === 1 ? tokenTypeOpenEm : tokenTypeOpenStrong;
                    closingMark.type = style === 1 ? tokenTypeCloseEm : tokenTypeCloseStrong;

                    // Remove the matched marks
                    marks.splice(arrayIndexOf(marks, openingMark), 1);
                    marks.splice(arrayIndexOf(marks, closingMark), 1);
                    bContinue = true;

                    break;
                }
            }
        }
    };

    // Process auto links eg: <google.com>
    markdownPrototype.ProcessAutoLink = function () {
        if (this.disableLinks) {
            return null;
        }
        var p = this.scanner, extraMode, ch, url, li, linkText;

        // Skip the angle bracket and remember the start
        p.SkipForward(1);
        p.Mark();

        extraMode = this.markdown.ExtraMode;

        // Allow anything up to the closing angle, watch for escapable characters
        while (!p.eof()) {
            ch = p.current();

            // No whitespace allowed
            if (isWhitespace(ch)) {
                break;
            }

            // End found?
            if (ch === '>') {
                url = unescapeString(p.Extract(), extraMode);

                li = null;
                if (isEmailAddress(url)) {
                    if (url.toLowerCase().substr(0, 7) === 'mailto:') {
                        linkText = url.substr(7);
                    } else {
                        linkText = url;
                        url = 'mailto:' + url;
                    }

                    li = new LinkInfo(new LinkDefinition('auto', url, null), linkText);
                } else if (isWebAddress(url)) {
                    li = new LinkInfo(new LinkDefinition('auto', url, null), url);
                }

                if (li !== null) {
                    p.SkipForward(1);
                    return this.CreateDataToken(tokenTypeLink, li);
                }

                return null;
            }

            p.SkipEscapableChar(extraMode);
        }

        // Didn't work
        return null;
    };

    // Process [link] and ![image] directives
    markdownPrototype.ProcessLinkOrImageOrFootnote = function () {
        var p = this.scanner,
            tokenType = p.SkipChar('!') ? tokenTypeImg : tokenTypeLink,
            savepos,
            extraMode,
            depth,
            ch,
            linkText,
            linkDef,
            linkId,
            id,
            footnoteIndex,
            i,
            start,
            end,
            def;

        // Opening '['
        if (!p.SkipChar('[')) {
            return null;
        }

        // Is it a foonote?
        savepos = this.position;
        if (this.markdown.ExtraMode && tokenType === tokenTypeLink && p.SkipChar('^')) {
            p.SkipLinespace();

            // Parse it
            p.Mark();
            id = p.SkipFootnoteID();
            if (id !== null && p.SkipChar(']')) {
                // Look it up and create footnote reference token
                footnoteIndex = this.markdown.ClaimFootnote(id);
                if (footnoteIndex >= 0) {
                    // Yes it's a footnote
                    return this.CreateDataToken(tokenTypeFootnote, { index: footnoteIndex, id: id });
                }
            }

            // Rewind
            this.position = savepos;
        }

        if (this.disableLinks && tokenType === tokenTypeLink) {
            return null;
        }
        extraMode = this.markdown.ExtraMode;

        // Find the closing square bracket, allowing for nesting, watching for escapable characters
        p.Mark();
        depth = 1;
        while (!p.eof()) {
            ch = p.current();
            if (ch === '[') {
                depth++;
            } else if (ch === ']') {
                depth--;
                if (depth === 0) {
                    break;
                }
            }

            p.SkipEscapableChar(extraMode);
        }

        // Quit if end
        if (p.eof()) {
            return null;
        }

        // Get the link text and unescape it
        linkText = unescapeString(p.Extract(), extraMode);

        // The closing ']'
        p.SkipForward(1);

        // Save position in case we need to rewind
        savepos = p.position;

        // Inline links must follow immediately
        if (p.SkipChar('(')) {
            // Extract the url and title
            linkDef = parseLinkTarget(p, null, this.markdown.ExtraMode);
            if (linkDef === null) {
                return null;
            }

            // Closing ')'
            p.SkipWhitespace();
            if (!p.SkipChar(')')) {
                return null;
            }

            // Create the token
            return this.CreateDataToken(tokenType, new LinkInfo(linkDef, linkText));
        }

        // Optional space or tab
        if (!p.SkipChar(' ')) {
            p.SkipChar('\t');
        }

        // If there's line end, we're allow it and as must line space as we want
        // before the link id.
        if (p.eol()) {
            p.SkipEol();
            p.SkipLinespace();
        }

        // Reference link?
        linkId = null;
        if (p.current() === '[') {
            // Skip the opening '['
            p.SkipForward(1);

            // Find the start/end of the id
            p.Mark();
            if (!p.Find(']')) {
                return null;
            }

            // Extract the id
            linkId = p.Extract();

            // Skip closing ']'
            p.SkipForward(1);
        } else {
            // Rewind to just after the closing ']'
            p.position = savepos;
        }

        // Link id not specified?
        if (!linkId) {
            linkId = linkText;

            // Convert all whitespace+line end to a single space
            while (true) {
                // Find carriage return
                i = linkId.indexOf('\n');
                if (i < 0) {
                    break;
                }
                start = i;
                while (start > 0 && isWhitespace(linkId.charAt(start - 1))) {
                    start--;
                }
                end = i;
                while (end < linkId.length && isWhitespace(linkId.charAt(end))) {
                    end++;
                }
                linkId = linkId.substr(0, start) + ' ' + linkId.substr(end);
            }
        }

        // Find the link definition, abort if not defined
        def = this.markdown.GetLinkDefinition(linkId);
        if (def === null) {
            return null;
        }

        // Create a token
        return this.CreateDataToken(tokenType, new LinkInfo(def, linkText));
    };

    // Process a ``` code span ```
    markdownPrototype.ProcessCodeSpan = function () {
        var p = this.scanner,
            start = p.position,
            // Count leading ticks
            tickcount = 0,
            startofcode,
            endpos,
            ret;

        while (p.SkipChar('`')) {
            tickcount++;
        }

        // Skip optional leading space...
        p.SkipWhitespace();

        // End?
        if (p.eof()) {
            return this.CreateToken(tokenTypeText, start, p.position - start);
        }
        startofcode = p.position;

        // Find closing ticks
        if (!p.Find(p.buf.substr(start, tickcount))) {
            return this.CreateToken(tokenTypeText, start, p.position - start);
        }

        // Save end position before backing up over trailing whitespace
        endpos = p.position + tickcount;
        while (isWhitespace(p.CharAtOffset(-1))) {
            p.SkipForward(-1);
        }

        // Create the token, move back to the end and we're done
        ret = this.CreateToken(tokenTypeCodeSpan, startofcode, p.position - startofcode);
        p.position = endpos;
        return ret;
    };

    markdownPrototype.CreateToken = function (type, startOffset, length) {
        if (this.spareTokens.length !== 0) {
            var t = this.spareTokens.pop();
            t.type = type;
            t.startOffset = startOffset;
            t.length = length;
            t.data = null;
            return t;
        } else {
            return new Token(type, startOffset, length);
        }
    };

    // CreateToken - create or re-use a token object
    markdownPrototype.CreateDataToken = function (type, data) {
        var token;
        if (this.spareTokens.length !== 0) {
            token = this.spareTokens.pop();
            token.type = type;
            token.data = data;
            return token;
        } else {
            token = new Token(type, 0, 0);
            token.data = data;
            return token;
        }
    };

    // FreeToken - return a token to the spare token pool
    markdownPrototype.FreeToken = function (token) {
        token.data = null;
        this.spareTokens.push(token);
    };

    /////////////////////////////////////////////////////////////////////////////
    // Block

    // ReSharper disable once InconsistentNaming
    function Block() {
    }

    markdownPrototype = Block.prototype;
    markdownPrototype.buf = null;
    markdownPrototype.blockType = blockTypeBlank;
    markdownPrototype.contentStart = 0;
    markdownPrototype.contentLen = 0;
    markdownPrototype.lineStart = 0;
    markdownPrototype.lineLen = 0;
    markdownPrototype.children = null;
    markdownPrototype.data = null;

    markdownPrototype.GetContent = function () {
        if (this.buf === null) {
            return null;
        }
        if (this.contentStart === -1) {
            return this.buf;
        }
        return this.buf.substr(this.contentStart, this.contentLen);
    };

    markdownPrototype.GetCodeContent = function () {
        var s = new StringBuilder(), i;
        for (i = 0; i < this.children.length; i++) {
            s.Append(this.children[i].GetContent());
            s.Append('\n');
        }
        return s.ToString();
    };

    markdownPrototype.RenderChildren = function (m, b) {
        for (var i = 0; i < this.children.length; i++) {
            this.children[i].Render(m, b);
        }
    };

    markdownPrototype.ResolveHeaderID = function (m) {
        // Already resolved?
        if (typeof (this.data) === 'string') {
            return this.data;
        }

        // Approach 1 - PHP Markdown Extra style header id
        var res = stripHtmlId(this.buf, this.contentStart, this.GetContentEnd()), id;
        if (res !== undefined && res !== null) {
            this.SetContentEnd(res.end);
            id = res.id;
        } else {
            // Approach 2 - pandoc style header id
            id = m.MakeUniqueHeaderID(this.buf, this.contentStart, this.contentLen);
        }

        this.data = id;
        return id;
    };

    markdownPrototype.Render = function (m, b) {
        var i, id, btemp, tag, name, line, lines, l;
        switch (this.blockType) {
        case blockTypeBlank:
            return;
        case blockTypeP:
            m.spanFormatter.FormatParagraph(b, this.buf, this.contentStart, this.contentLen);
            break;
        case blockTypeSpan:
            m.spanFormatter.Format(b, this.buf, this.contentStart, this.contentLen);
            b.Append('\n');
            break;
        case blockTypeH1:
        case blockTypeH2:
        case blockTypeH3:
        case blockTypeH4:
        case blockTypeH5:
        case blockTypeH6:
            if (m.ExtraMode && !m.SafeMode) {
                b.Append('<h' + (this.blockType - blockTypeH1 + 1).toString());
                id = this.ResolveHeaderID(m);
                if (id) {
                    b.Append(' id="');
                    b.Append(id);
                    b.Append('">');
                } else {
                    b.Append('>');
                }
            } else {
                b.Append('<h' + (this.blockType - blockTypeH1 + 1).toString() + '>');
            }
            m.spanFormatter.Format(b, this.buf, this.contentStart, this.contentLen);
            b.Append('</h' + (this.blockType - blockTypeH1 + 1).toString() + '>\n');
            break;
        case blockTypeHr:
            b.Append('<hr />\n');
            return;
        case blockTypeUserBreak:
            return;
        case blockTypeOlLi:
        case blockTypeUlLi:
            b.Append('<li>');
            m.spanFormatter.Format(b, this.buf, this.contentStart, this.contentLen);
            b.Append('</li>\n');
            break;
        case blockTypeHtml:
            b.Append(this.buf.substr(this.contentStart, this.contentLen));
            break;
        case blockTypeUnsafeHtml:
            b.HtmlEncode(this.buf, this.contentStart, this.contentLen);
            return;
        case blockTypeCodeblock:
            b.Append('<pre><code');
            if (m.FormatCodeBlockAttributes !== null) {
                b.Append(m.FormatCodeBlockAttributes(this.data));
            }
            b.Append('>');
            btemp = b;
            if (m.FormatCodeBlock) {
                btemp = b;
                b = new StringBuilder();
            }

            for (i = 0; i < this.children.length; i++) {
                line = this.children[i];
                b.HtmlEncodeAndConvertTabsToSpaces(line.buf, line.contentStart, line.contentLen);
                b.Append('\n');
            }

            if (m.FormatCodeBlock) {
                btemp.Append(m.FormatCodeBlock(b.ToString(), this.data));
                b = btemp;
            }
            b.Append('</code></pre>\n\n');
            break;
        case blockTypeQuote:
            b.Append('<blockquote>\n');
            this.RenderChildren(m, b);
            b.Append('</blockquote>\n');
            break;
        case blockTypeLi:
            b.Append('<li>\n');
            this.RenderChildren(m, b);
            b.Append('</li>\n');
            return;
        case blockTypeOl:
            b.Append('<ol>\n');
            this.RenderChildren(m, b);
            b.Append('</ol>\n');
            return;
        case blockTypeUl:
            b.Append('<ul>\n');
            this.RenderChildren(m, b);
            b.Append('</ul>\n');
            return;
        case blockTypeHtmlTag:
            tag = this.data;

            // Prepare special tags
            name = tag.name.toLowerCase();
            if (name === 'a') {
                m.OnPrepareLink(tag);
            } else if (name === 'img') {
                m.OnPrepareImage(tag, m.RenderingTitledImage);
            }

            tag.RenderOpening(b);
            b.Append('\n');
            this.RenderChildren(m, b);
            tag.RenderClosing(b);
            b.Append('\n');
            return;
        case blockTypeComposite:
        case blockTypeFootnote:
            this.RenderChildren(m, b);
            return;
        case blockTypeTableSpec:
            this.data.Render(m, b);
            return;
        case blockTypeDd:
            b.Append('<dd>');
            if (this.children !== null) {
                b.Append('\n');
                this.RenderChildren(m, b);
            } else {
                m.spanFormatter.Format(b, this.buf, this.contentStart, this.contentLen);
            }
            b.Append('</dd>\n');
            break;
        case blockTypeDt:
            if (this.children === null) {
                lines = this.GetContent().split('\n');
                for (i = 0; i < lines.length; i++) {
                    l = lines[i];
                    b.Append('<dt>');
                    m.spanFormatter.Format2(b, trim(l));
                    b.Append('</dt>\n');
                }
            } else {
                b.Append('<dt>\n');
                this.RenderChildren(m, b);
                b.Append('</dt>\n');
            }
            break;
        case blockTypeDl:
            b.Append('<dl>\n');
            this.RenderChildren(m, b);
            b.Append('</dl>\n');
            return;
        case blockTypePFootnote:
            b.Append('<p>');
            if (this.contentLen > 0) {
                m.spanFormatter.Format(b, this.buf, this.contentStart, this.contentLen);
                b.Append('&nbsp;');
            }
            b.Append(this.data);
            b.Append('</p>\n');
            break;
        }
    };

    markdownPrototype.RevertToPlain = function () {
        this.blockType = blockTypeP;
        this.contentStart = this.lineStart;
        this.contentLen = this.lineLen;
    };

    markdownPrototype.GetContentEnd = function () {
        return this.contentStart + this.contentLen;
    };

    markdownPrototype.SetContentEnd = function (value) {
        this.contentLen = value - this.contentStart;
    };

    // Count the leading spaces on a block
    // Used by list item evaluation to determine indent levels
    // irrespective of indent line type.
    markdownPrototype.GetLeadingSpaces = function () {
        var count = 0, i;
        for (i = this.lineStart; i < this.lineStart + this.lineLen; i++) {
            if (this.buf.charAt(i) === ' ') {
                count++;
            } else {
                break;
            }
        }
        return count;
    };

    markdownPrototype.CopyFrom = function (other) {
        this.blockType = other.blockType;
        this.buf = other.buf;
        this.contentStart = other.contentStart;
        this.contentLen = other.contentLen;
        this.lineStart = other.lineStart;
        this.lineLen = other.lineLen;
        return this;
    };

    /////////////////////////////////////////////////////////////////////////////
    // BlockProcessor
    // ReSharper disable once InconsistentNaming
    function BlockProcessor(m, markdownInHtml) {
        this.markdown = m;
        this.parentType = blockTypeBlank;
        this.hasMarkdownInHtml = markdownInHtml;
    }

    markdownPrototype = BlockProcessor.prototype;

    markdownPrototype.Process = function (str) {
        // Reset string scanner
        var p = new StringScanner(str);

        return this.ScanLines(p);
    };

    markdownPrototype.ProcessRange = function (str, startOffset, len) {
        // Reset string scanner
        var p = new StringScanner(str, startOffset, len);

        return this.ScanLines(p);
    };

    markdownPrototype.StartTable = function (p, spec, lines) {
        // Mustn't have more than 1 preceeding line
        if (lines.length > 1) {
            return false;
        }

        // Rewind, parse the header row then fast forward back to current pos
        var savepos, row;
        if (lines.length === 1) {
            savepos = p.position;
            p.position = lines[0].lineStart;
            spec.headers = spec.ParseRow(p);
            if (spec.headers === null) {
                return false;
            }
            p.position = savepos;
            lines.length = 0;
        }

        // Parse all .rows
        while (true) {
            savepos = p.position;
            row = spec.ParseRow(p);
            if (row !== null) {
                spec.rows.push(row);
                continue;
            }

            p.position = savepos;
            break;
        }

        return true;
    };

    markdownPrototype.ScanLines = function (p) {
        // The final set of blocks will be collected here
        var blocks = [],
            lines = [],
            prevBlockType = -1,
            bPreviousBlank,
            b,
            previousLine,
            currentBlockType,
            spec,
            savepos;
        while (!p.eof()) {
            // Remember if the previous line was blank
            bPreviousBlank = prevBlockType === blockTypeBlank;

            // Get the next block
            b = this.EvaluateLine(p);
            prevBlockType = b.blockType;

            // For dd blocks, we need to know if it was preceded by a blank line
            // so store that fact as the block's data.
            if (b.blockType === blockTypeDd) {
                b.data = bPreviousBlank;
            }

            // SetExt header?
            if (b.blockType === blockTypePostH1 || b.blockType === blockTypePostH2) {
                if (lines.length > 0) {
                    // Remove the previous line and collapse the current paragraph
                    previousLine = lines.pop();
                    this.CollapseLines(blocks, lines);

                    // If previous line was blank
                    if (previousLine.blockType !== blockTypeBlank) {
                        // Convert the previous line to a heading and add to block list
                        previousLine.RevertToPlain();
                        previousLine.blockType = b.blockType === blockTypePostH1 ? blockTypeH1 : blockTypeH2;
                        blocks.push(previousLine);
                        continue;
                    }
                }

                // Couldn't apply setext header to a previous line
                if (b.blockType === blockTypePostH1) {
                    // `===` gets converted to normal paragraph
                    b.RevertToPlain();
                    lines.push(b);
                }

                continue;
            }

            // Work out the current paragraph type
            currentBlockType = lines.length > 0 ? lines[0].blockType : blockTypeBlank;

            // Starting a table?
            if (b.blockType === blockTypeTableSpec) {
                // Get the table spec, save position
                spec = b.data;
                savepos = p.position;
                if (!this.StartTable(p, spec, lines)) {
                    // Not a table, revert the tablespec row to plain,
                    // fast forward back to where we were up to and continue
                    // on as if nothing happened
                    p.position = savepos;
                    b.RevertToPlain();
                } else {
                    blocks.push(b);
                    continue;
                }
            }

            // Process this line
            switch (b.blockType) {
            case blockTypeBlank:
                switch (currentBlockType) {
                case blockTypeBlank:
                    this.FreeBlock(b);
                    break;
                case blockTypeP:
                    this.CollapseLines(blocks, lines);
                    this.FreeBlock(b);
                    break;
                case blockTypeQuote:
                case blockTypeOlLi:
                case blockTypeUlLi:
                case blockTypeDd:
                case blockTypeFootnote:
                case blockTypeIndent:
                    lines.push(b);
                    break;
                }
                break;
            case blockTypeP:
                switch (currentBlockType) {
                case blockTypeBlank:
                case blockTypeP:
                    lines.push(b);
                    break;
                case blockTypeQuote:
                case blockTypeOlLi:
                case blockTypeUlLi:
                case blockTypeDd:
                case blockTypeFootnote:
                    previousLine = lines[lines.length - 1];
                    if (previousLine.blockType === blockTypeBlank) {
                        this.CollapseLines(blocks, lines);
                        lines.push(b);
                    } else {
                        lines.push(b);
                    }
                    break;

                case blockTypeIndent:
                    this.CollapseLines(blocks, lines);
                    lines.push(b);
                    break;
                }
                break;
            case blockTypeIndent:
                switch (currentBlockType) {
                case blockTypeBlank:
                    // Start a code block
                    lines.push(b);
                    break;
                case blockTypeP:
                case blockTypeQuote:
                    previousLine = lines[lines.length - 1];
                    if (previousLine.blockType === blockTypeBlank) {
                        // Start a code block after a paragraph
                        this.CollapseLines(blocks, lines);
                        lines.push(b);
                    } else {
                        // indented line in paragraph, just continue it
                        b.RevertToPlain();
                        lines.push(b);
                    }
                    break;
                case blockTypeOlLi:
                case blockTypeUlLi:
                case blockTypeIndent:
                case blockTypeDd:
                case blockTypeFootnote:
                    lines.push(b);
                    break;
                }
                break;
            case blockTypeQuote:
                if (currentBlockType !== blockTypeQuote) {
                    this.CollapseLines(blocks, lines);
                }
                lines.push(b);
                break;
            case blockTypeOlLi:
            case blockTypeUlLi:
                switch (currentBlockType) {
                case blockTypeBlank:
                    lines.push(b);
                    break;
                case blockTypeP:
                case blockTypeQuote:
                    previousLine = lines[lines.length - 1];
                    if (previousLine.blockType === blockTypeBlank ||
                        this.parentType === blockTypeOlLi ||
                        this.parentType === blockTypeUlLi ||
                        this.parentType === blockTypeDd) {
                        // List starting after blank line after paragraph or quote
                        this.CollapseLines(blocks, lines);
                        lines.push(b);
                    } else {
                        // List's can't start in middle of a paragraph
                        b.RevertToPlain();
                        lines.push(b);
                    }
                    break;
                case blockTypeOlLi:
                case blockTypeUlLi:
                    if (b.blockType !== blockTypeOlLi && b.blockType !== blockTypeUlLi) {
                        this.CollapseLines(blocks, lines);
                    }
                    lines.push(b);
                    break;
                case blockTypeDd:
                case blockTypeFootnote:
                    if (b.blockType !== currentBlockType) {
                        this.CollapseLines(blocks, lines);
                    }
                    lines.push(b);
                    break;
                case blockTypeIndent:
                    // List after code block
                    this.CollapseLines(blocks, lines);
                    lines.push(b);
                    break;
                }
                break;
            case blockTypeDd:
            case blockTypeFootnote:
                switch (currentBlockType) {
                case blockTypeBlank:
                case blockTypeP:
                case blockTypeDd:
                case blockTypeFootnote:
                    this.CollapseLines(blocks, lines);
                    lines.push(b);
                    break;
                default:
                    b.RevertToPlain();
                    lines.push(b);
                    break;
                }
                break;
            default:
                this.CollapseLines(blocks, lines);
                blocks.push(b);
                break;
            }
        }

        this.CollapseLines(blocks, lines);

        if (this.markdown.ExtraMode) {
            this.BuildDefinitionLists(blocks);
        }

        return blocks;
    };

    markdownPrototype.CreateBlock = function (lineStart) {
        var b;
        if (this.markdown.spareBlocks.length > 1) {
            b = this.markdown.spareBlocks.pop();
        } else {
            b = new Block();
        }
        b.lineStart = lineStart;
        return b;
    };

    markdownPrototype.FreeBlock = function (b) {
        this.markdown.spareBlocks.push(b);
    };

    markdownPrototype.FreeBlocks = function (blocks) {
        for (var i = 0; i < blocks.length; i++) {
            this.markdown.spareBlocks.push(blocks[i]);
        }
        blocks.length = 0;
    };

    markdownPrototype.RenderLines = function (lines) {
        var b = this.markdown.GetStringBuilder(), i, l;
        for (i = 0; i < lines.length; i++) {
            l = lines[i];
            b.Append(l.buf.substr(l.contentStart, l.contentLen));
            b.Append('\n');
        }
        return b.ToString();
    };

    markdownPrototype.CollapseLines = function (blocks, lines) {
        var para, str, bp, prev, wrapper, codeblock, firstline, i, quote;
        // Remove trailing blank lines
        while (lines.length > 0 && lines[lines.length - 1].blockType === blockTypeBlank) {
            this.FreeBlock(lines.pop());
        }

        // Quit if empty
        if (lines.length === 0) {
            return;
        }


        // What sort of block?
        switch (lines[0].blockType) {
        case blockTypeP:
            // Collapse all lines into a single paragraph
            para = this.CreateBlock(lines[0].lineStart);
            para.blockType = blockTypeP;
            para.buf = lines[0].buf;
            para.contentStart = lines[0].contentStart;
            para.SetContentEnd(lines[lines.length - 1].GetContentEnd());
            blocks.push(para);
            this.FreeBlocks(lines);
            break;
        case blockTypeQuote:
            // Get the content
            str = this.RenderLines(lines);

            // Create the new block processor
            bp = new BlockProcessor(this.markdown, this.hasMarkdownInHtml);
            bp.parentType = blockTypeQuote;

            // Create a new quote block
            quote = this.CreateBlock(lines[0].lineStart);
            quote.blockType = blockTypeQuote;
            quote.children = bp.Process(str);
            this.FreeBlocks(lines);
            blocks.push(quote);
            break;
        case blockTypeOlLi:
        case blockTypeUlLi:
            blocks.push(this.BuildList(lines));
            break;
        case blockTypeDd:
            if (blocks.length > 0) {
                prev = blocks[blocks.length - 1];
                switch (prev.blockType) {
                case blockTypeP:
                    prev.blockType = blockTypeDt;
                    break;
                case blockTypeDd:
                    break;
                default:
                    wrapper = this.CreateBlock(prev.lineStart);
                    wrapper.blockType = blockTypeDt;
                    wrapper.children = [];
                    wrapper.children.push(prev);
                    blocks.pop();
                    blocks.push(wrapper);
                    break;
                }
            }
            blocks.push(this.BuildDefinition(lines));
            break;
        case blockTypeFootnote:
            this.markdown.AddFootnote(this.BuildFootnote(lines));
            break;
        case blockTypeIndent:
            codeblock = this.CreateBlock(lines[0].lineStart);
            codeblock.blockType = blockTypeCodeblock;
            codeblock.children = [];
            firstline = lines[0].GetContent();
            if (firstline.substr(0, 2) === '{{' && firstline.substr(firstline.length - 2, 2) === '}}') {
                codeblock.data = firstline.substr(2, firstline.length - 4);
                lines.splice(0, 1);
            }
            for (i = 0; i < lines.length; i++) {
                codeblock.children.push(lines[i]);
            }
            blocks.push(codeblock);
            lines.length = 0;
            break;
        }
    };

    markdownPrototype.EvaluateLine = function (p) {
        // Create a block
        var b = this.CreateBlock(p.position);

        // Store line start
        b.buf = p.buf;

        // Scan the line
        b.contentStart = p.position;
        b.contentLen = -1;
        b.blockType = this.EvaluateLineInternal(p, b);


        // If end of line not returned, do it automatically
        if (b.contentLen < 0) {
            // Move to end of line
            p.SkipToEol();
            b.contentLen = p.position - b.contentStart;
        }

        // Setup line length
        b.lineLen = p.position - b.lineStart;

        // Next line
        p.SkipEol();

        // Create block
        return b;
    };

    markdownPrototype.EvaluateLineInternal = function (p, b) {
        // Empty line?
        if (p.eol()) {
            return blockTypeBlank;
        }

        // Save start of line position
        var lineStart = p.position,
            ch,
            chType,
            tabPos,
            leadingSpaces,
            level,
            res,
            spec,
            count,
            abbr,
            title,
            savepos,
            id,
            l;

        // ## Heading ##
        ch = p.current();
        if (ch === '#') {
            // Work out heading level
            level = 1;
            p.SkipForward(1);
            while (p.current() === '#') {
                level++;
                p.SkipForward(1);
            }

            // Limit of 6
            if (level > 6) {
                level = 6;
            }

            // Skip any whitespace
            p.SkipLinespace();

            // Save start position
            b.contentStart = p.position;

            // Jump to end
            p.SkipToEol();

            // In extra mode, check for a trailing HTML ID
            if (this.markdown.ExtraMode && !this.markdown.SafeMode) {
                res = stripHtmlId(p.buf, b.contentStart, p.position);
                if (res !== null) {
                    b.data = res.id;
                    p.position = res.end;
                }
            }

            // Rewind over trailing hashes
            while (p.position > b.contentStart && p.CharAtOffset(-1) === '#') {
                p.SkipForward(-1);
            }

            // Rewind over trailing spaces
            while (p.position > b.contentStart && isWhitespace(p.CharAtOffset(-1))) {
                p.SkipForward(-1);
            }

            // Create the heading block
            b.contentLen = p.position - b.contentStart;

            p.SkipToEol();
            return blockTypeH1 + (level - 1);
        }

        // Check for entire line as - or = for setext h1 and h2
        if (ch === '-' || ch === '=') {
            // Skip all matching characters
            chType = ch;
            while (p.current() === chType) {
                p.SkipForward(1);
            }

            // Trailing whitespace allowed
            p.SkipLinespace();

            // If not at eol, must have found something other than setext header
            if (p.eol()) {
                return chType === '=' ? blockTypePostH1 : blockTypePostH2;
            }

            p.position = lineStart;
        }

        if (this.markdown.ExtraMode) {
            // MarkdownExtra Table row indicator?
            spec = tableSpecParse(p);
            if (spec !== null) {
                b.data = spec;
                return blockTypeTableSpec;
            }

            p.position = lineStart;


            // Fenced code blocks?
            if (ch === '~' || ch === '`') {
                if (this.ProcessFencedCodeBlock(p, b)) {
                    return b.blockType;
                }

                // Rewind
                p.position = lineStart;
            }
        }

        // Scan the leading whitespace, remembering how many spaces and where the first tab is
        tabPos = -1;
        leadingSpaces = 0;
        while (!p.eol()) {
            if (p.current() === ' ') {
                if (tabPos < 0) {
                    leadingSpaces++;
                }
            } else if (p.current() === '\t') {
                if (tabPos < 0) {
                    tabPos = p.position;
                }
            } else {
                // Something else, get out
                break;
            }
            p.SkipForward(1);
        }

        // Blank line?
        if (p.eol()) {
            b.contentLen = 0;
            return blockTypeBlank;
        }

        // 4 leading spaces?
        if (leadingSpaces >= 4) {
            b.contentStart = lineStart + 4;
            return blockTypeIndent;
        }

        // Tab in the first 4 characters?
        if (tabPos >= 0 && tabPos - lineStart < 4) {
            b.contentStart = tabPos + 1;
            return blockTypeIndent;
        }

        // Treat start of line as after leading whitespace
        b.contentStart = p.position;

        // Get the next character
        ch = p.current();

        // Html block?
        if (ch === '<') {
            if (this.ScanHtml(p, b)) {
                return b.blockType;
            }

            // Rewind
            p.position = b.contentStart;
        }

        // Block quotes start with '>' and have one space or one tab following
        if (ch === '>') {
            // Block quote followed by space
            if (isLinespace(p.CharAtOffset(1))) {
                // Skip it and create quote block
                p.SkipForward(2);
                b.contentStart = p.position;
                return blockTypeQuote;
            }

            p.SkipForward(1);
            b.contentStart = p.position;
            return blockTypeQuote;
        }

        // Horizontal rule - a line consisting of 3 or more '-', '_' or '*' with optional spaces and nothing else
        if (ch === '-' || ch === '_' || ch === '*') {
            count = 0;
            while (!p.eol()) {
                chType = p.current();
                if (p.current() === ch) {
                    count++;
                    p.SkipForward(1);
                    continue;
                }

                if (isLinespace(p.current())) {
                    p.SkipForward(1);
                    continue;
                }

                break;
            }

            if (p.eol() && count >= 3) {
                if (this.markdown.UserBreaks) {
                    return blockTypeUserBreak;
                } else {
                    return blockTypeHr;
                }
            }

            // Rewind
            p.position = b.contentStart;
        }

        // Abbreviation definition?
        if (this.markdown.ExtraMode && ch === '*' && p.CharAtOffset(1) === '[') {
            p.SkipForward(2);
            p.SkipLinespace();

            p.Mark();
            while (!p.eol() && p.current() !== ']') {
                p.SkipForward(1);
            }

            abbr = trim(p.Extract());
            if (p.current() === ']' && p.CharAtOffset(1) === ':' && abbr) {
                p.SkipForward(2);
                p.SkipLinespace();

                p.Mark();

                p.SkipToEol();

                title = p.Extract();

                this.markdown.AddAbbreviation(abbr, title);

                return blockTypeBlank;
            }

            p.position = b.contentStart;
        }


        // Unordered list
        if ((ch === '*' || ch === '+' || ch === '-') && isLinespace(p.CharAtOffset(1))) {
            // Skip it
            p.SkipForward(1);
            p.SkipLinespace();
            b.contentStart = p.position;
            return blockTypeUlLi;
        }

        // Definition
        if (ch === ':' && this.markdown.ExtraMode && isLinespace(p.CharAtOffset(1))) {
            p.SkipForward(1);
            p.SkipLinespace();
            b.contentStart = p.position;
            return blockTypeDd;
        }

        // Ordered list
        if (isDigit(ch)) {
            // Ordered list?  A line starting with one or more digits, followed by a '.' and a space or tab

            // Skip all digits
            p.SkipForward(1);
            while (isDigit(p.current())) {
                p.SkipForward(1);
            }
            if (p.SkipChar('.') && p.SkipLinespace()) {
                b.contentStart = p.position;
                return blockTypeOlLi;
            }

            p.position = b.contentStart;
        }

        // Reference link definition?
        if (ch === '[') {
            // Footnote definition?
            if (this.markdown.ExtraMode && p.CharAtOffset(1) === '^') {
                savepos = p.position;

                p.SkipForward(2);

                id = p.SkipFootnoteID();
                if (id !== null && p.SkipChar(']') && p.SkipChar(':')) {
                    p.SkipLinespace();
                    b.contentStart = p.position;
                    b.data = id;
                    return blockTypeFootnote;
                }

                p.position = savepos;
            }

            // Parse a link definition
            l = parseLinkDefinition(p, this.markdown.ExtraMode);
            if (l !== null) {
                this.markdown.AddLinkDefinition(l);
                return blockTypeBlank;
            }
        }

        // Nothing special
        return blockTypeP;
    };

    markdownPrototype.GetMarkdownMode = function (tag) {
        // Get the markdown attribute
        var md = tag.attributes['markdown'];
        if (md === undefined) {
            if (this.hasMarkdownInHtml) {
                return markdownInHtmlModeDeep;
            } else {
                return markdownInHtmlModeNa;
            }
        }

        // Remove it
        delete tag.attributes['markdown'];

        // Parse mode
        if (md === '1') {
            return (tag.GetFlags() & htmlTagFlagsContentAsSpan) !== 0 ? markdownInHtmlModeSpan : markdownInHtmlModeBlock;
        }
        if (md === 'block') {
            return markdownInHtmlModeBlock;
        }
        if (md === 'deep') {
            return markdownInHtmlModeDeep;
        }
        if (md === 'span') {
            return markdownInHtmlModeSpan;
        }
        return markdownInHtmlModeOff;
    };

    markdownPrototype.ProcessMarkdownEnabledHtml = function (p, b, openingTag, mode) {
        // Current position is just after the opening tag

        // Scan until we find matching closing tag
        var innerPos = p.position, depth = 1, bHasUnsafeContent = false, tagpos, tag, span, bp;
        while (!p.eof()) {
            // Find next angle bracket
            if (!p.Find('<')) {
                break;
            }

            // Is it a html tag?
            tagpos = p.position;
            tag = parseHtmlTag(p);
            if (tag === null) {
                // Nope, skip it
                p.SkipForward(1);
                continue;
            }

            // In markdown off mode, we need to check for unsafe tags
            if (this.markdown.SafeMode && mode === markdownInHtmlModeOff && !bHasUnsafeContent) {
                if (!tag.IsSafe()) {
                    bHasUnsafeContent = true;
                }
            }

            // Ignore self closing tags
            if (tag.closed) {
                continue;
            }

            // Same tag?
            if (tag.name === openingTag.name) {
                if (tag.closing) {
                    depth--;
                    if (depth === 0) {
                        // End of tag?
                        p.SkipLinespace();
                        p.SkipEol();

                        b.blockType = blockTypeHtmlTag;
                        b.data = openingTag;
                        b.SetContentEnd(p.position);
                        switch (mode) {
                        case markdownInHtmlModeSpan:
                            span = this.CreateBlock(innerPos);
                            span.buf = p.buf;
                            span.blockType = blockTypeSpan;
                            span.contentStart = innerPos;
                            span.contentLen = tagpos - innerPos;

                            b.children = [];
                            b.children.push(span);
                            break;

                        case markdownInHtmlModeBlock:
                        case markdownInHtmlModeDeep:
                            // Scan the internal content
                            bp = new BlockProcessor(this.markdown, mode === markdownInHtmlModeDeep);
                            b.children = bp.ProcessRange(p.buf, innerPos, tagpos - innerPos);
                            break;

                        case markdownInHtmlModeOff:
                            if (bHasUnsafeContent) {
                                b.blockType = blockTypeUnsafeHtml;
                                b.SetContentEnd(p.position);
                            } else {
                                span = this.CreateBlock(innerPos);
                                span.buf = p.buf;
                                span.blockType = blockTypeHtml;
                                span.contentStart = innerPos;
                                span.contentLen = tagpos - innerPos;

                                b.children = [];
                                b.children.push(span);
                            }
                            break;
                        }

                        return true;
                    }
                } else {
                    depth++;
                }
            }
        }

        // Missing closing tag(s).
        return false;
    };

    markdownPrototype.ScanHtml = function (p, b) {
        // Remember start of html
        var posStartPiece = p.position,
            openingTag,
            bHasUnsafeContent,
            flags,
            bHeadBlock,
            headStart,
            markdownMode,
            childBlocks,
            depth,
            tag,
            posStartCurrentTag,
            htmlBlock,
            markdownBlock,
            content;

        // Parse a HTML tag
        openingTag = parseHtmlTag(p);
        if (openingTag === null) {
            return false;
        }

        // Closing tag?
        if (openingTag.closing) {
            return false;
        }

        // Safe mode?
        bHasUnsafeContent = false;
        if (this.markdown.SafeMode && !openingTag.IsSafe()) {
            bHasUnsafeContent = true;
        }
        flags = openingTag.GetFlags();

        // Is it a block level tag?
        if ((flags & htmlTagFlagsBlock) === 0) {
            return false;
        }

        // Closed tag, hr or comment?
        if ((flags & htmlTagFlagsNoClosing) !== 0 || openingTag.closed) {
            p.SkipLinespace();
            p.SkipEol();
            b.contentLen = p.position - b.contentStart;
            b.blockType = bHasUnsafeContent ? blockTypeUnsafeHtml : blockTypeHtml;
            return true;
        }

        // Can it also be an inline tag?
        if ((flags & htmlTagFlagsInline) !== 0) {
            // Yes, opening tag must be on a line by itself
            p.SkipLinespace();
            if (!p.eol()) {
                return false;
            }
        }

        // Head block extraction?
        bHeadBlock = this.markdown.ExtractHeadBlocks && openingTag.name.toLowerCase() === 'head';
        headStart = p.position;

        // Work out the markdown mode for this element
        if (!bHeadBlock && this.markdown.ExtraMode) {
            markdownMode = this.GetMarkdownMode(openingTag);
            if (markdownMode !== markdownInHtmlModeNa) {
                return this.ProcessMarkdownEnabledHtml(p, b, openingTag, markdownMode);
            }
        }

        childBlocks = null;

        // Now capture everything up to the closing tag and put it all in a single HTML block
        depth = 1;

        while (!p.eof()) {
            if (!p.Find('<')) {
                break;
            }

            // Save position of current tag
            posStartCurrentTag = p.position;

            tag = parseHtmlTag(p);
            if (tag === null) {
                p.SkipForward(1);
                continue;
            }

            // Safe mode checks
            if (this.markdown.SafeMode && !tag.IsSafe()) {
                bHasUnsafeContent = true;
            }


            // Ignore self closing tags
            if (tag.closed) {
                continue;
            }

            // Markdown enabled content?
            if (!bHeadBlock && !tag.closing && this.markdown.ExtraMode && !bHasUnsafeContent) {
                markdownMode = this.GetMarkdownMode(tag);
                if (markdownMode !== markdownInHtmlModeNa) {
                    markdownBlock = this.CreateBlock(posStartPiece);
                    if (this.ProcessMarkdownEnabledHtml(p, markdownBlock, tag, markdownMode)) {
                        if (childBlocks === null) {
                            childBlocks = [];
                        }

                        // Create a block for everything before the markdown tag
                        if (posStartCurrentTag > posStartPiece) {
                            htmlBlock = this.CreateBlock(posStartPiece);
                            htmlBlock.buf = p.buf;
                            htmlBlock.blockType = blockTypeHtml;
                            htmlBlock.contentStart = posStartPiece;
                            htmlBlock.contentLen = posStartCurrentTag - posStartPiece;

                            childBlocks.push(htmlBlock);
                        }

                        // Add the markdown enabled child block
                        childBlocks.push(markdownBlock);

                        // Remember start of the next piece
                        posStartPiece = p.position;

                        continue;
                    } else {
                        this.FreeBlock(markdownBlock);
                    }
                }
            }

            // Same tag?
            if (tag.name === openingTag.name && !tag.closed) {
                if (tag.closing) {
                    depth--;
                    if (depth === 0) {
                        // End of tag?
                        p.SkipLinespace();
                        p.SkipEol();

                        // If anything unsafe detected, just encode the whole block
                        if (bHasUnsafeContent) {
                            b.blockType = blockTypeUnsafeHtml;
                            b.SetContentEnd(p.position);
                            return true;
                        }

                        // Did we create any child blocks
                        if (childBlocks !== null) {
                            // Create a block for the remainder
                            if (p.position > posStartPiece) {
                                htmlBlock = this.CreateBlock(posStartPiece);
                                htmlBlock.buf = p.buf;
                                htmlBlock.blockType = blockTypeHtml;
                                htmlBlock.contentStart = posStartPiece;
                                htmlBlock.contentLen = p.position - posStartPiece;

                                childBlocks.push(htmlBlock);
                            }

                            // Return a composite block
                            b.blockType = blockTypeComposite;
                            b.SetContentEnd(p.position);
                            b.children = childBlocks;
                            return true;
                        }

                        // Extract the head block content
                        if (bHeadBlock) {
                            content = p.buf.substr(headStart, posStartCurrentTag - headStart);
                            this.markdown.HeadBlockContent = this.markdown.HeadBlockContent + trim(content) + '\n';
                            b.blockType = blockTypeHtml;
                            b.contentStart = p.position;
                            b.contentEnd = p.position;
                            b.lineStart = p.position;
                            return true;
                        }

                        // Straight html block
                        b.blockType = blockTypeHtml;
                        b.contentLen = p.position - b.contentStart;
                        return true;
                    }
                } else {
                    depth++;
                }
            }
        }

        // Missing closing tag(s).
        return blockTypeBlank;
    };

    /*
    * BuildList - build a single <ol> or <ul> list
    */
    markdownPrototype.BuildList = function (lines) {
        // What sort of list are we dealing with
        var listType = lines[0].blockType,
            leadingSpace,
            i,
            list,
            startOfLi,
            endOfLi,
            bAnyBlanks,
            sb,
            j,
            item,
            bp,
            child,
            thisLeadingSpace,
            saveend,
            l;

        // Preprocess
        // 1. Collapse all plain lines (ie: handle hardwrapped lines)
        // 2. Promote any unindented lines that have more leading space
        //    than the original list item to indented, including leading
        //    special chars
        leadingSpace = lines[0].GetLeadingSpaces();
        for (i = 1; i < lines.length; i++) {
            // Join plain paragraphs
            if ((lines[i].blockType === blockTypeP) &&
            (lines[i - 1].blockType === blockTypeP ||
                lines[i - 1].blockType === blockTypeUlLi ||
                lines[i - 1].blockType === blockTypeOlLi)) {
                lines[i - 1].SetContentEnd(lines[i].GetContentEnd());
                this.FreeBlock(lines[i]);
                lines.splice(i, 1);
                i--;
                continue;
            }

            if (lines[i].blockType !== blockTypeIndent && lines[i].blockType !== blockTypeBlank) {
                thisLeadingSpace = lines[i].GetLeadingSpaces();
                if (thisLeadingSpace > leadingSpace) {
                    // Change line to indented, including original leading chars
                    // (eg: '* ', '>', '1.' etc...)
                    lines[i].blockType = blockTypeIndent;
                    saveend = lines[i].GetContentEnd();
                    lines[i].contentStart = lines[i].lineStart + thisLeadingSpace;
                    lines[i].SetContentEnd(saveend);
                }
            }
        }


        // Create the wrapping list item
        list = this.CreateBlock(0);
        list.blockType = (listType === blockTypeUlLi ? blockTypeUl : blockTypeOl);
        list.children = [];

        // Process all lines in the range
        for (i = 0; i < lines.length; i++) {
            // Find start of item, including leading blanks
            startOfLi = i;
            while (startOfLi > 0 && lines[startOfLi - 1].blockType === blockTypeBlank) {
                startOfLi--;
            }

            // Find end of the item, including trailing blanks
            endOfLi = i;
            while (endOfLi < lines.length - 1 &&
                lines[endOfLi + 1].blockType !== blockTypeUlLi &&
                lines[endOfLi + 1].blockType !== blockTypeOlLi) {
                endOfLi++;
            }

            // Is this a simple or complex list item?
            if (startOfLi === endOfLi) {
                // It's a simple, single line item item
                list.children.push(this.CreateBlock().CopyFrom(lines[i]));
            } else {
                // Build a new string containing all child items
                bAnyBlanks = false;
                sb = this.markdown.GetStringBuilder();
                for (j = startOfLi; j <= endOfLi; j++) {
                    l = lines[j];
                    sb.Append(l.buf.substr(l.contentStart, l.contentLen));
                    sb.Append('\n');

                    if (lines[j].blockType === blockTypeBlank) {
                        bAnyBlanks = true;
                    }
                }

                // Create the item and process child blocks
                item = this.CreateBlock();
                item.blockType = blockTypeLi;
                item.lineStart = lines[startOfLi].lineStart;
                bp = new BlockProcessor(this.markdown);
                bp.parentType = listType;
                item.children = bp.Process(sb.ToString());

                // If no blank lines, change all contained paragraphs to plain text
                if (!bAnyBlanks) {
                    for (j = 0; j < item.children.length; j++) {
                        child = item.children[j];
                        if (child.blockType === blockTypeP) {
                            child.blockType = blockTypeSpan;
                        }
                    }
                }

                // Add the complex item
                list.children.push(item);
            }

            // Continue processing from end of li
            i = endOfLi;
        }

        list.lineStart = list.children[0].lineStart;

        this.FreeBlocks(lines);
        lines.length = 0;

        // Continue processing after this item
        return list;
    };

    /*
    * BuildDefinition - build a single <dd> item
    */
    markdownPrototype.BuildDefinition = function (lines) {
        // Collapse all plain lines (ie: handle hardwrapped lines)
        var i, bPreceededByBlank, sb, item, bp, ret, l;
        for (i = 1; i < lines.length; i++) {
            // Join plain paragraphs
            if ((lines[i].blockType === blockTypeP) &&
            (lines[i - 1].blockType === blockTypeP || lines[i - 1].blockType === blockTypeDd)) {
                lines[i - 1].SetContentEnd(lines[i].GetContentEnd());
                this.FreeBlock(lines[i]);
                lines.splice(i, 1);
                i--;
                continue;
            }
        }

        // Single line definition
        bPreceededByBlank = lines[0].data;
        if (lines.length === 1 && !bPreceededByBlank) {
            ret = lines[0];
            lines.length = 0;
            return ret;
        }

        // Build a new string containing all child items
        sb = this.markdown.GetStringBuilder();
        for (i = 0; i < lines.length; i++) {
            l = lines[i];
            sb.Append(l.buf.substr(l.contentStart, l.contentLen));
            sb.Append('\n');
        }

        // Create the item and process child blocks
        item = this.CreateBlock(lines[0].lineStart);
        item.blockType = blockTypeDd;
        bp = new BlockProcessor(this.markdown);
        bp.parentType = blockTypeDd;
        item.children = bp.Process(sb.ToString());

        this.FreeBlocks(lines);
        lines.length = 0;

        // Continue processing after this item
        return item;
    };

    markdownPrototype.BuildDefinitionLists = function (blocks) {
        var currentList = null, i;
        for (i = 0; i < blocks.length; i++) {
            switch (blocks[i].blockType) {
            case blockTypeDt:
            case blockTypeDd:
                if (currentList === null) {
                    currentList = this.CreateBlock(blocks[i].lineStart);
                    currentList.blockType = blockTypeDl;
                    currentList.children = [];
                    blocks.splice(i, 0, currentList);
                    i++;
                }

                currentList.children.push(blocks[i]);
                blocks.splice(i, 1);
                i--;
                break;

            default:
                currentList = null;
                break;
            }
        }
    };

    markdownPrototype.BuildFootnote = function (lines) {
        // Collapse all plain lines (ie: handle hardwrapped lines)
        var i, sb, bp, item, l;
        for (i = 1; i < lines.length; i++) {
            // Join plain paragraphs
            if ((lines[i].blockType === blockTypeP) &&
            (lines[i - 1].blockType === blockTypeP || lines[i - 1].blockType === blockTypeFootnote)) {
                lines[i - 1].SetContentEnd(lines[i].GetContentEnd());
                this.FreeBlock(lines[i]);
                lines.splice(i, 1);
                i--;
                continue;
            }
        }

        // Build a new string containing all child items
        sb = this.markdown.GetStringBuilder();
        for (i = 0; i < lines.length; i++) {
            l = lines[i];
            sb.Append(l.buf.substr(l.contentStart, l.contentLen));
            sb.Append('\n');
        }

        bp = new BlockProcessor(this.markdown);
        bp.parentType = blockTypeFootnote;

        // Create the item and process child blocks
        item = this.CreateBlock(lines[0].lineStart);
        item.blockType = blockTypeFootnote;
        item.data = lines[0].data;
        item.children = bp.Process(sb.ToString());

        this.FreeBlocks(lines);
        lines.length = 0;

        // Continue processing after this item
        return item;
    };

    markdownPrototype.ProcessFencedCodeBlock = function (p, b) {
        var fenceStart = p.position, delim = p.current(), strFence, lang = '', startCode, endCode, child;

        // Extract the fence
        p.Mark();
        while (p.current() === delim) {
            p.SkipForward(1);
        }
        strFence = p.Extract();

        // Must be at least 3 long
        if (strFence.length < 3) {
            return false;
        }
        while (!isWhitespace(p.buf.charAt(p.position))) {
            lang += p.buf.charAt(p.position);
            p.position++;
        }

        // Rest of line must be blank
        p.SkipLinespace();
        if (!p.eol()) {
            return false;
        }

        // Skip the eol and remember start of code
        p.SkipEol();
        startCode = p.position;

        // Find the end fence
        if (!p.Find(strFence)) {
            return false;
        }

        // Character before must be a eol char
        if (!isLineend(p.CharAtOffset(-1))) {
            return false;
        }
        endCode = p.position;

        // Skip the fence
        p.SkipForward(strFence.length);

        // Whitespace allowed at end
        p.SkipLinespace();
        if (!p.eol()) {
            return false;
        }

        // Create the code block
        b.blockType = blockTypeCodeblock;
        b.children = [];
        b.data = lang;

        // Remove the trailing line end
        // (Javascript version has already normalized line ends to \n)
        endCode--;

        // Create the child block with the entire content
        child = this.CreateBlock(fenceStart);
        child.blockType = blockTypeIndent;
        child.buf = p.buf;
        child.contentStart = startCode;
        child.contentLen = endCode - startCode;
        b.children.push(child);

        // Done
        return true;
    };

    // ReSharper disable once InconsistentNaming
    function TableSpec() {
        this.columns = [];
        this.headers = null;
        this.rows = [];
    }

    markdownPrototype = TableSpec.prototype;

    markdownPrototype.LeadingBar = false;
    markdownPrototype.TrailingBar = false;

    markdownPrototype.ParseRow = function (p) {
        p.SkipLinespace();

        if (p.eol()) {
            return null;
        } // Blank line ends the table

        var anyBars = this.LeadingBar, row = [];

        if (this.LeadingBar && !p.SkipChar('|')) {
            return null;
        }

        // Parse all columns except the last
        while (!p.eol()) {
            // Find the next vertical bar
            p.Mark();
            while (!p.eol() && p.current() !== '|') {
                p.SkipEscapableChar(true);
            }
            row.push(trim(p.Extract()));

            anyBars |= p.SkipChar('|');
        }

        // Require at least one bar to continue the table
        if (!anyBars) {
            return null;
        }

        // Add missing columns
        while (row.length < this.columns.length) {
            row.push('&nbsp;');
        }

        p.SkipEol();
        return row;
    };

    markdownPrototype.RenderRow = function (m, b, row, type) {
        for (var i = 0; i < row.length; i++) {
            b.Append('\t<');
            b.Append(type);

            if (i < this.columns.length) {
                switch (this.columns[i]) {
                case columnAlignmentLeft:
                    b.Append(' align="left"');
                    break;
                case columnAlignmentRight:
                    b.Append(' align="right"');
                    break;
                case columnAlignmentCenter:
                    b.Append(' align="center"');
                    break;
                }
            }

            b.Append('>');
            m.spanFormatter.Format2(b, row[i]);
            b.Append('</');
            b.Append(type);
            b.Append('>\n');
        }
    };

    markdownPrototype.Render = function (m, b) {
        var i, row;
        b.Append('<table>\n');
        if (this.headers !== null) {
            b.Append('<thead>\n<tr>\n');
            this.RenderRow(m, b, this.headers, 'th');
            b.Append('</tr>\n</thead>\n');
        }

        b.Append('<tbody>\n');
        for (i = 0; i < this.rows.length; i++) {
            row = this.rows[i];
            b.Append('<tr>\n');
            this.RenderRow(m, b, row, 'td');
            b.Append('</tr>\n');
        }
        b.Append('</tbody>\n');

        b.Append('</table>\n');
    };

    function tableSpecParse(p) {
        // Leading line space allowed
        p.SkipLinespace();

        // Quick check for typical case
        if (p.current() !== '|' && p.current() !== ':' && p.current() !== '-') {
            return null;
        }

        var spec = null, alignLeft, alignRight, col;

        // Leading bar, looks like a table spec
        if (p.SkipChar('|')) {
            spec = new TableSpec();
            spec.LeadingBar = true;
        }

        // Process all columns
        while (true) {
            // Parse column spec
            p.SkipLinespace();

            // Must have something in the spec
            if (p.current() === '|') {
                return null;
            }
            alignLeft = p.SkipChar(':');
            while (p.current() === '-') {
                p.SkipForward(1);
            }
            alignRight = p.SkipChar(':');
            p.SkipLinespace();

            // Work out column alignment
            col = columnAlignmentNa;
            if (alignLeft && alignRight) {
                col = columnAlignmentCenter;
            } else if (alignLeft) {
                col = columnAlignmentLeft;
            } else if (alignRight) {
                col = columnAlignmentRight;
            }

            if (p.eol()) {
                // Not a spec?
                if (spec === null) {
                    return null;
                }

                // Add the final spec?
                spec.columns.push(col);
                return spec;
            }

            // We expect a vertical bar
            if (!p.SkipChar('|')) {
                return null;
            }

            // Create the table spec
            if (spec === null) {
                spec = new TableSpec();
            }

            // Add the column
            spec.columns.push(col);

            // Check for trailing vertical bar
            p.SkipLinespace();
            if (p.eol()) {
                spec.TrailingBar = true;
                return spec;
            }

            // Next column
        }
    }

    // Exposed stuff
    this.Markdown = Markdown;
    this.HtmlTag = HtmlTag;
    this.SplitUserSections = splitUserSections;
}();

// Export to nodejs
if (typeof exports !== 'undefined') {
    exports.Markdown = MarkdownDeep.Markdown;
    exports.SplitUserSections = MarkdownDeep.SplitUserSections;
}

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

/* global MarkdownDeepEditor*/
var MarkdownDeepEditorUI = new function () {
    'use strict';
    // Helper function that returns the HTML content of the toolbar
    this.ToolbarHtml = function () {
        return '<ul class="mdd_buttons">\n' +
            '<li><i class="fa fa-undo mdd_undo" title="Undo (Ctrl+Z)"></i></li>\n' +
            '<li><i class="fa fa-repeat mdd_redo" title="Redo (Ctrl+Y)"></i></li>\n' +
            '<li><span class="mdd_sep"></span></li>\n' +
            '<li><i class="fa fa-header mdd_heading" title="Change Heading Style (Ctrl+H, or Ctrl+0 to Ctrl+6)"></i></li>\n' +
            '<li><i class="fa fa-code mdd_code" title="Preformatted Code (Ctrl+K or Tab/Shift+Tab on multiline selection)"></i></li>\n' +
            '<li><span class="mdd_sep"></span></li>\n' +
            '<li><i class="fa fa-bold mdd_bold" title="Bold (Ctrl+B)"></i></li>\n' +
            '<li><i class="fa fa-italic mdd_italic" title="Italic (Ctrl+I)"></i></li>\n' +
            '<li><span class="mdd_sep"></span></li>\n' +
            '<li><i class="fa fa-list-ul mdd_ullist" title="Bullets (Ctrl+U)"></i></li>\n' +
            '<li><i class="fa fa-list-o mdd_ollist" title="Numbering (Ctrl+O)"></i></li>\n' +
            '<li><i class="fa fa-outdent mdd_outdent" title="Unquote (Ctrl+W)"></i></li>\n' +
            '<li><i class="fa fa-indent mdd_indent" title="Quote (Ctrl+Q)"></i></li>\n' +
            '<li><span class="mdd_sep"></span></li>\n' +
            '<li><i class="fa fa-link mdd_link" title="Insert Hyperlink (Ctrl+L)"></i></li>\n' +
            '<li><i class="fa fa-picture-o mdd_img" title="Insert Image (Ctrl+G)"></i></li>\n' +
            '<li><i class="fa fa-arrows-h mdd_hr" title="Insert Horizontal Rule (Ctrl+R)"></i></li>\n' +
            '<li><span class="mdd_sep"></span></li>\n' +
            '<li><i class="mdd_help fa fa-question"></i></li>\n' +
            '</ul>\n' +
            '<div style="clear:both"></div>\n';
    };
    // Toolbar click handler
    this.onToolbarButton = function (e) {
        // Find the editor, grab the MarkdownEditor.Editor class from it's data
        var command,
            editor = $(e.target)
                .closest('div.mdd_toolbar_wrap')
                .next('.mdd_editor_wrap')
                .children('textarea')
                .data('mdd');

        // Invoke the command
        //https://guides.github.com/features/mastering-markdown/
        command = $(e.target).attr('class').match(/mdd_[\w-]*\b/)[0].substr(4);
        if (command === 'help') {
            window.open('https://guides.github.com/features/mastering-markdown/', 'help');
            return false;
        }

        editor.InvokeCommand(command);

        return false;
    };
}();

(function ($) {
    'use strict';
    $.fn.MarkdownDeep = function (options) {
        // Default settings
        var settings =
        {
            toolbar: true,
            preview: true
        };

        // Apply options
        if (options) {
            $.extend(settings, options);
        }

        // Create each markdown editor
        return this.each(function (index) {
            // Check if our textarea is encased in a wrapper div
            var editorwrap = $(this).parent('.mdd_editor_wrap'), toolbarwrap, toolbar, preview = null, previewSelector, editor;
            if (editorwrap.length === 0) {
                editorwrap = $(this).wrap('<div class=\"mdd_editor_wrap\" />').parent();
            }

            // Create the toolbar
            if (settings.toolbar) {
                // Possible cases: 1) wrapper and toolbar exists, 2) only toolbar exists (no wrapper), 3) nothing exists
                toolbarwrap = editorwrap.prev('.mdd_toolbar_wrap');
                toolbar = editorwrap.prev('.mdd_toolbar');
                if (toolbarwrap.length === 0) {
                    // Does the toolbar exist?
                    if (toolbar.length === 0) {
                        toolbar = $('<div class="mdd_toolbar" />');
                        toolbar.insertBefore(editorwrap);
                    }
                    // Add our wrapper div (whether or not we created the toolbar or found it)
                    toolbar.wrap('<div class=\"mdd_toolbar_wrap\" />').parent();
                } else {
                    // wrapper was there, how about the toolbar?
                    if (toolbar.length === 0) {
                        // No toolbar div
                        toolbar = $('<div class="mdd_toolbar" />');
                        // Put the toolbar inside the provided wrapper div
                        toolbarwrap.html(toolbar);
                    }
                }
                // Stuff the toolbar with buttons!
                toolbar.append($(MarkdownDeepEditorUI.ToolbarHtml()));

                $('.mdd_buttons i', toolbar).click(MarkdownDeepEditorUI.onToolbarButton);
            }

            if (settings.preview === true) {
                // Work out the preview div, by:
                //      1. Look for a selector as a data attribute on the textarea
                //      2. If not present, assume <div class="mdd_preview">
                //      3. If not found, append a div with that class
                previewSelector = $(this).attr('data-mdd-preview');
                if (!previewSelector) {
                    previewSelector = '.mdd_preview';
                }
                preview = $(previewSelector)[index];
                if (!preview) {
                    $('<div class="mdd_preview"></div>').insertAfter(this);
                    preview = $('.mdd_preview')[index];
                }
            }

            // Create the editor helper
            editor = new MarkdownDeepEditor.Editor(this, preview);

            // Apply options to both the markdown component and the editor
            //  (Yes lazy but easier for client)
            if (options) {
                jQuery.extend(editor.Markdown, options);
                jQuery.extend(editor, options);
            }

            // Notify editor that options have changed
            editor.onOptionsChanged();

            // Attach the editor to the text area in case we want to get it back
            $(this).data('mdd', editor);
        });
    };
})(jQuery);
