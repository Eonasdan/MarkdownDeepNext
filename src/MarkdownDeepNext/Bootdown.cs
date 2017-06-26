// 
//   MarkdownDeep - http://www.toptensoftware.com/markdowndeep
//	 Copyright (C) 2010-2011 Topten Software
// 
//   Licensed under the Apache License, Version 2.0 (the "License"); you may not use this product except in 
//   compliance with the License. You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
//   Unless required by applicable law or agreed to in writing, software distributed under the License is 
//   distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. 
//   See the License for the specific language governing permissions and limitations under the License.
//

using System;
using System.Collections.Generic;
using System.Text;

namespace MarkdownDeep
{

    public class ImageInfo
    {
        public string URL;
        public bool TitledImage;
        public int Width;
        public int Height;
    }


    public class Markdown
    {
        // Constructor
        public Markdown()
        {
            HtmlClassFootnotes = "footnotes";
            _mStringBuilder = new StringBuilder();
            _mStringBuilderFinal = new StringBuilder();
            _mStringScanner = new StringScanner();
            SpanFormatter = new SpanFormatter(this);
            _mLinkDefinitions = new Dictionary<string, LinkDefinition>(StringComparer.CurrentCultureIgnoreCase);
            _mFootnotes = new Dictionary<string, Block>();
            _mUsedFootnotes = new List<Block>();
            _mUsedHeaderIDs = new Dictionary<string, bool>();
        }

        internal List<Block> ProcessBlocks(string str)
        {
            // Reset the list of link definitions
            _mLinkDefinitions.Clear();
            _mFootnotes.Clear();
            _mUsedFootnotes.Clear();
            _mUsedHeaderIDs.Clear();
            _mAbbreviationMap = null;
            _mAbbreviationList = null;

            // Process blocks
            return new BlockProcessor(this, MarkdownInHtml).Process(str);
        }
        public string Transform(string str)
        {
            Dictionary<string, LinkDefinition> linkDefinitions;
            return Transform(str, out linkDefinitions);
        }

        // Transform a string
        public string Transform(string str, out Dictionary<string, LinkDefinition> definitions)
        {
            // Build blocks
            var blocks = ProcessBlocks(str);

            // Sort abbreviations by length, longest to shortest
            if (_mAbbreviationMap != null)
            {
                _mAbbreviationList = new List<Abbreviation>();
                _mAbbreviationList.AddRange(_mAbbreviationMap.Values);
                _mAbbreviationList.Sort(
                    (a, b) => b.Abbr.Length - a.Abbr.Length
                    );
            }

            // Setup string builder
            var sb = _mStringBuilderFinal;
            sb.Length = 0;

            if (SummaryLength != 0)
            {
                // Render all blocks
                foreach (var b in blocks)
                {
                    b.RenderPlain(this, sb);

                    if (SummaryLength > 0 && sb.Length > SummaryLength)
                        break;
                }

            }
            else
            {
                var iSection = -1;

                // Leading section (ie: plain text before first heading)
                if (blocks.Count > 0 && !IsSectionHeader(blocks[0]))
                {
                    iSection = 0;
                    OnSectionHeader(sb, 0);
                    OnSectionHeadingSuffix(sb, 0);
                }

                // Render all blocks
                foreach (var b in blocks)
                {
                    // New section?
                    if (IsSectionHeader(b))
                    {
                        // Finish the previous section
                        if (iSection >= 0)
                        {
                            OnSectionFooter(sb, iSection);
                        }

                        // Work out next section index
                        iSection = iSection < 0 ? 1 : iSection + 1;

                        // Section header
                        OnSectionHeader(sb, iSection);

                        // Section Heading
                        b.Render(this, sb);

                        // Section Heading suffix
                        OnSectionHeadingSuffix(sb, iSection);
                    }
                    else
                    {
                        // Regular section
                        b.Render(this, sb);
                    }
                }

                // Finish final section
                if (blocks.Count > 0)
                    OnSectionFooter(sb, iSection);

                // Render footnotes
                if (_mUsedFootnotes.Count > 0)
                {
                    sb.Append("\n<div class=\"");
                    sb.Append(HtmlClassFootnotes);
                    sb.Append("\">\n");
                    sb.Append("<hr />\n");
                    sb.Append("<ol>\n");
                    foreach (var fn in _mUsedFootnotes)
                    {
                        sb.Append("<li id=\"fn:");
                        sb.Append((string)fn.Data); // footnote id
                        sb.Append("\">\n");


                        // We need to get the return link appended to the last paragraph
                        // in the footnote
                        string strReturnLink = $"<a href=\"#fnref:{(string) fn.Data}\" rev=\"footnote\">&#8617;</a>";

                        // Get the last child of the footnote
                        var child = fn.Children[fn.Children.Count - 1];
                        if (child.BlockType == BlockType.p)
                        {
                            child.BlockType = BlockType.p_footnote;
                            child.Data = strReturnLink;
                        }
                        else
                        {
                            child = CreateBlock();
                            child.ContentLen = 0;
                            child.BlockType = BlockType.p_footnote;
                            child.Data = strReturnLink;
                            fn.Children.Add(child);
                        }


                        fn.Render(this, sb);

                        sb.Append("</li>\n");
                    }
                    sb.Append("</ol>\n");
                    sb.Append("</div>\n");
                }
            }

            definitions = _mLinkDefinitions;

            // Done
            return sb.ToString();
        }

        public int SummaryLength
        {
            get;
            set;
        }

        // Set to true to only allow whitelisted safe html tags
        public bool SafeMode
        {
            get;
            set;
        }

        // Set to true to enable ExtraMode, which enables the same set of 
        // features as implemented by PHP Markdown Extra.
        //  - Markdown in html (eg: <div markdown="1"> or <div markdown="deep"> )
        //  - Header ID attributes
        //  - Fenced code blocks
        //  - Definition lists
        //  - Footnotes
        //  - Abbreviations
        //  - Simple tables
        public bool ExtraMode
        {
            get;
            set;
        } = true;

        // When set, all html block level elements automatically support
        // markdown syntax within them.  
        // (Similar to Pandoc's handling of markdown in html)
        public bool MarkdownInHtml
        {
            get;
            set;
        }

        // When set, all headings will have an auto generated ID attribute
        // based on the heading text (uses the same algorithm as Pandoc)
        public bool AutoHeadingIDs
        {
            get;
            set;
        }

        // When set, all non-qualified urls (links and images) will
        // be qualified using this location as the base.
        // Useful when rendering RSS feeds that require fully qualified urls.
        public string UrlBaseLocation
        {
            get;
            set;
        }

        // When set, all non-qualified urls (links and images) begining with a slash
        // will qualified by prefixing with this string.
        // Useful when rendering RSS feeds that require fully qualified urls.
        public string UrlRootLocation
        {
            get;
            set;
        }

        // When true, all fully qualified urls will be give `target="_blank"' attribute
        // causing them to appear in a separate browser window/tab
        // ie: relative links open in same window, qualified links open externally
        public bool NewWindowForExternalLinks
        {
            get;
            set;
        }

        // When true, all urls (qualified or not) will get target="_blank" attribute
        // (useful for preview mode on posts)
        public bool NewWindowForLocalLinks
        {
            get;
            set;
        }

        // When set, will try to determine the width/height for local images by searching
        // for an appropriately named file relative to the specified location
        // Local file system location of the document root.  Used to locate image
        // files that start with slash.
        // Typical value: c:\inetpub\www\wwwroot
        public string DocumentRoot
        {
            get;
            set;
        }

        // Local file system location of the current document.  Used to locate relative
        // path images for image size.
        // Typical value: c:\inetpub\www\wwwroot\subfolder
        public string DocumentLocation
        {
            get;
            set;
        }

        // Limit the width of images (0 for no limit)
        public int MaxImageWidth
        {
            get;
            set;
        }

        // Set rel="nofollow" on all links
        public bool NoFollowLinks
        {
            get;
            set;
        }

        /// <summary>
        /// Add the NoFollow attribute to all external links.
        /// </summary>
        public bool NoFollowExternalLinks
        {
            get;
            set;
        }



        public Func<string, string> QualifyUrl;

        // Override to qualify non-local image and link urls
        public virtual string OnQualifyUrl(string url)
        {
            var q = QualifyUrl?.Invoke(url);
            if (q != null)
                return url;

            // Quit if we don't have a base location
            if (string.IsNullOrEmpty(UrlBaseLocation))
                return url;

            // Is the url a fragment?
            if (url.StartsWith("#"))
                return url;

            // Is the url already fully qualified?
            if (Utils.IsUrlFullyQualified(url))
                return url;

            if (url.StartsWith("/"))
            {
                if (!string.IsNullOrEmpty(UrlRootLocation))
                {
                    return UrlRootLocation + url;
                }

                // Need to find domain root
                var pos = UrlBaseLocation.IndexOf("://", StringComparison.Ordinal);
                if (pos == -1)
                    pos = 0;
                else
                    pos += 3;

                // Find the first slash after the protocol separator
                pos = UrlBaseLocation.IndexOf('/', pos);

                // Get the domain name
                var strDomain = pos < 0 ? UrlBaseLocation : UrlBaseLocation.Substring(0, pos);

                // Join em
                return strDomain + url;
            }
            if (!UrlBaseLocation.EndsWith("/")) return UrlBaseLocation + "/" + url;
            return UrlBaseLocation + url;
        }

        public Func<ImageInfo, bool> GetImageSize;

        // Override to supply the size of an image
        public virtual bool OnGetImageSize(string url, bool titledImage, out int width, out int height)
        {
            if (GetImageSize != null)
            {
                var info = new ImageInfo { URL = url, TitledImage = titledImage };
                if (GetImageSize(info))
                {
                    width = info.Width;
                    height = info.Height;
                    return true;
                }
            }

            width = 0;
            height = 0;

            if (Utils.IsUrlFullyQualified(url))
                return false;

            // Work out base location
            var str = url.StartsWith("/") ? DocumentRoot : DocumentLocation;
            if (string.IsNullOrEmpty(str))
                return false;

            // Work out file location
            if (str.EndsWith("/") || str.EndsWith("\\"))
            {
                str = str.Substring(0, str.Length - 1);
            }

            if (url.StartsWith("/"))
            {
                url = url.Substring(1);
            }

            str = str + "\\" + url.Replace("/", "\\");


            // 

            //Create an image object from the uploaded file
            try
            {
                var img = System.Drawing.Image.FromFile(str);
                width = img.Width;
                height = img.Height;

                if (MaxImageWidth == 0 || width <= MaxImageWidth) return true;
                height = (int)(height * (double)MaxImageWidth / width);
                width = MaxImageWidth;

                return true;
            }
            catch (Exception)
            {
                return false;
            }
        }


        public Func<HtmlTag, bool> PrepareLink;

        // Override to modify the attributes of a link
        public virtual void OnPrepareLink(HtmlTag tag)
        {
            if (PrepareLink != null)
            {
                if (PrepareLink(tag))
                    return;
            }

            var url = tag.Attributes["href"];

            // No follow?
            if (NoFollowLinks)
            {
                tag.Attributes["rel"] = "nofollow";
            }

            // No follow external links only
            if (NoFollowExternalLinks)
            {
                if (Utils.IsUrlFullyQualified(url))
                    tag.Attributes["rel"] = "nofollow";
            }



            // New window?
            if ((NewWindowForExternalLinks && Utils.IsUrlFullyQualified(url)) ||
                 (NewWindowForLocalLinks && !Utils.IsUrlFullyQualified(url)))
            {
                tag.Attributes["target"] = "_blank";
            }

            // Qualify url
            tag.Attributes["href"] = OnQualifyUrl(url);
        }

        public Func<HtmlTag, bool, bool> PrepareImage;

        internal bool RenderingTitledImage = false;

        // Override to modify the attributes of an image
        public virtual void OnPrepareImage(HtmlTag tag, bool titledImage)
        {
            if (PrepareImage != null)
            {
                if (PrepareImage(tag, titledImage))
                    return;
            }

            // Try to determine width and height
            int width, height;
            if (OnGetImageSize(tag.Attributes["src"], titledImage, out width, out height))
            {
                tag.Attributes["width"] = width.ToString();
                tag.Attributes["height"] = height.ToString();
            }

            // Now qualify the url
            tag.Attributes["src"] = OnQualifyUrl(tag.Attributes["src"]);
        }

        // Set the html class for the footnotes div
        // (defaults to "footnotes")
        // btw fyi: you can use css to disable the footnotes horizontal rule. eg:
        // div.footnotes hr { display:none }
        public string HtmlClassFootnotes
        {
            get;
            set;
        }

        // Callback to format a code block (ie: apply syntax highlighting)
        // string FormatCodeBlock(code)
        // Code = code block content (ie: the code to format)
        // Return the formatted code, including <pre> and <code> tags
        public Func<Markdown, string, string> FormatCodeBlock;

        // when set to true, will remove head blocks and make content available
        // as HeadBlockContent
        public bool ExtractHeadBlocks
        {
            get;
            set;
        }

        // Retrieve extracted head block content
        public string HeadBlockContent
        {
            get;
            internal set;
        }

        // Treats "===" as a user section break
        public bool UserBreaks
        {
            get;
            set;
        }

        // Set the classname for titled images
        // A titled image is defined as a paragraph that contains an image and nothing else.
        // If not set (the default), this features is disabled, otherwise the output is:
        // 
        // <div class="<%=this.HtmlClassTitledImages%>">
        //	<img src="image.png" />
        //	<p>Alt text goes here</p>
        // </div>
        //
        // Use CSS to style the figure and the caption
        public string HtmlClassTitledImages
        {
            // TODO:
            get;
            set;
        }

        // Set a format string to be rendered before headings
        // {0} = section number
        // (useful for rendering links that can lead to a page that edits that section)
        // (eg: "<a href=/edit/page?section={0}>"
        public string SectionHeader
        {
            get;
            set;
        }

        // Set a format string to be rendered after each section heading
        public string SectionHeadingSuffix
        {
            get;
            set;
        }

        // Set a format string to be rendered after the section content (ie: before
        // the next section heading, or at the end of the document).
        public string SectionFooter
        {
            get;
            set;
        }

        public virtual void OnSectionHeader(StringBuilder dest, int index)
        {
            if (SectionHeader != null)
            {
                dest.AppendFormat(SectionHeader, index);
            }
        }

        public virtual void OnSectionHeadingSuffix(StringBuilder dest, int index)
        {
            if (SectionHeadingSuffix != null)
            {
                dest.AppendFormat(SectionHeadingSuffix, index);
            }
        }

        public virtual void OnSectionFooter(StringBuilder dest, int index)
        {
            if (SectionFooter != null)
            {
                dest.AppendFormat(SectionFooter, index);
            }
        }

        private bool IsSectionHeader(Block b)
        {
            return b.BlockType >= BlockType.h1 && b.BlockType <= BlockType.h3;
        }



        // Split the markdown into sections, one section for each
        // top level heading
        public static List<string> SplitUserSections(string markdown)
        {
            // Build blocks
            var md = new Markdown {UserBreaks = true};

            // Process blocks
            var blocks = md.ProcessBlocks(markdown);

            // Create sections
            var sections = new List<string>();
            var sectionOffset = 0;
            for (var i = 0; i < blocks.Count; i++)
            {
                var b = blocks[i];
                if (b.BlockType != BlockType.user_break) continue;
                // Get the offset of the section
                var iSectionOffset = b.LineStart;

                // Add section
                sections.Add(markdown.Substring(sectionOffset, iSectionOffset - sectionOffset).Trim());

                // Next section starts on next line
                if (i + 1 < blocks.Count)
                {
                    sectionOffset = blocks[i + 1].LineStart;
                    if (sectionOffset == 0)
                        sectionOffset = blocks[i + 1].ContentStart;
                }
                else
                    sectionOffset = markdown.Length;
            }

            // Add the last section
            if (markdown.Length > sectionOffset)
            {
                sections.Add(markdown.Substring(sectionOffset).Trim());
            }

            return sections;
        }

        // Join previously split sections back into one document
        public static string JoinUserSections(List<string> sections)
        {
            var sb = new StringBuilder();
            for (var i = 0; i < sections.Count; i++)
            {
                if (i > 0)
                {
                    // For subsequent sections, need to make sure we
                    // have a line break after the previous section.
                    var previous = sections[sections.Count - 1];
                    if (previous.Length > 0 && !previous.EndsWith("\n") && !previous.EndsWith("\r"))
                        sb.Append("\n");

                    sb.Append("\n===\n\n");
                }

                sb.Append(sections[i]);
            }

            return sb.ToString();
        }

        // Split the markdown into sections, one section for each
        // top level heading
        public static List<string> SplitSections(string markdown)
        {
            // Build blocks
            var md = new Markdown();

            // Process blocks
            var blocks = md.ProcessBlocks(markdown);

            // Create sections
            var sections = new List<string>();
            var sectionOffset = 0;
            foreach (var b in blocks)
            {
                if (!md.IsSectionHeader(b)) continue;
                // Get the offset of the section
                var iSectionOffset = b.LineStart;

                // Add section
                sections.Add(markdown.Substring(sectionOffset, iSectionOffset - sectionOffset));

                sectionOffset = iSectionOffset;
            }

            // Add the last section
            if (markdown.Length > sectionOffset)
            {
                sections.Add(markdown.Substring(sectionOffset));
            }

            return sections;
        }

        // Join previously split sections back into one document
        public static string JoinSections(List<string> sections)
        {
            var sb = new StringBuilder();
            for (var i = 0; i < sections.Count; i++)
            {
                if (i > 0)
                {
                    // For subsequent sections, need to make sure we
                    // have a line break after the previous section.
                    var previous = sections[sections.Count - 1];
                    if (previous.Length > 0 && !previous.EndsWith("\n") && !previous.EndsWith("\r"))
                        sb.Append("\n");
                }

                sb.Append(sections[i]);
            }

            return sb.ToString();
        }

        // Add a link definition
        internal void AddLinkDefinition(LinkDefinition link)
        {
            // Store it
            _mLinkDefinitions[link.ID] = link;
        }

        internal void AddFootnote(Block footnote)
        {
            _mFootnotes[(string)footnote.Data] = footnote;
        }

        // Look up a footnote, claim it and return it's index (or -1 if not found)
        internal int ClaimFootnote(string id)
        {
            Block footnote;
            if (!_mFootnotes.TryGetValue(id, out footnote)) return -1;
            // Move the foot note to the used footnote list
            _mUsedFootnotes.Add(footnote);
            _mFootnotes.Remove(id);

            // Return it's display index
            return _mUsedFootnotes.Count - 1;
        }

        // Get a link definition
        public LinkDefinition GetLinkDefinition(string id)
        {
            LinkDefinition link;
            return _mLinkDefinitions.TryGetValue(id, out link) ? link : null;
        }

        internal void AddAbbreviation(string abbr, string title)
        {
            if (_mAbbreviationMap == null)
            {
                // First time
                _mAbbreviationMap = new Dictionary<string, Abbreviation>();
            }
            else if (_mAbbreviationMap.ContainsKey(abbr))
            {
                // Remove previous
                _mAbbreviationMap.Remove(abbr);
            }

            // Store abbreviation
            _mAbbreviationMap.Add(abbr, new Abbreviation(abbr, title));

        }

        internal List<Abbreviation> GetAbbreviations()
        {
            return _mAbbreviationList;
        }

        // HtmlEncode a range in a string to a specified string builder
        internal void HtmlEncode(StringBuilder dest, string str, int start, int len)
        {
            _mStringScanner.Reset(str, start, len);
            var p = _mStringScanner;
            while (!p.Eof)
            {
                var ch = p.Current;
                switch (ch)
                {
                    case '&':
                        dest.Append("&amp;");
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
                        dest.Append(ch);
                        break;
                }
                p.SkipForward(1);
            }
        }


        // HtmlEncode a string, also converting tabs to spaces (used by CodeBlocks)
        internal void HtmlEncodeAndConvertTabsToSpaces(StringBuilder dest, string str, int start, int len)
        {
            _mStringScanner.Reset(str, start, len);
            var p = _mStringScanner;
            var pos = 0;
            while (!p.Eof)
            {
                var ch = p.Current;
                switch (ch)
                {
                    case '\t':
                        dest.Append(' ');
                        pos++;
                        while ((pos % 4) != 0)
                        {
                            dest.Append(' ');
                            pos++;
                        }
                        pos--;      // Compensate for the pos++ below
                        break;

                    case '\r':
                    case '\n':
                        dest.Append('\n');
                        pos = 0;
                        p.SkipEol();
                        continue;

                    case '&':
                        dest.Append("&amp;");
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
                        dest.Append(ch);
                        break;
                }
                p.SkipForward(1);
                pos++;
            }
        }

        internal string MakeUniqueHeaderID(string strHeaderText)
        {
            return MakeUniqueHeaderID(strHeaderText, 0, strHeaderText.Length);

        }

        internal string MakeUniqueHeaderID(string strHeaderText, int startOffset, int length)
        {
            if (!AutoHeadingIDs)
                return null;

            // Extract a pandoc style cleaned header id from the header text
            var strBase = SpanFormatter.MakeID(strHeaderText, startOffset, length);

            // If nothing left, use "section"
            if (string.IsNullOrEmpty(strBase))
                strBase = "section";

            // Make sure it's unique by append -n counter
            var strWithSuffix = strBase;
            var counter = 1;
            while (_mUsedHeaderIDs.ContainsKey(strWithSuffix))
            {
                strWithSuffix = strBase + "-" + counter;
                counter++;
            }

            // Store it
            _mUsedHeaderIDs.Add(strWithSuffix, true);

            // Return it
            return strWithSuffix;
        }


        /*
		 * Get this markdown processors string builder.  
		 * 
		 * We re-use the same string builder whenever we can for performance.  
		 * We just reset the length before starting to / use it again, which 
		 * hopefully should keep the memory around for next time.
		 * 
		 * Note, care should be taken when using this string builder to not
		 * call out to another function that also uses it.
		 */
        internal StringBuilder GetStringBuilder()
        {
            _mStringBuilder.Length = 0;
            return _mStringBuilder;
        }


        internal SpanFormatter SpanFormatter { get; }

        #region Block Pooling

        // We cache and re-use blocks for performance

        private readonly Stack<Block> _mSpareBlocks = new Stack<Block>();

        internal Block CreateBlock()
        {
            return _mSpareBlocks.Count != 0 ? _mSpareBlocks.Pop() : new Block();
        }

        internal void FreeBlock(Block b)
        {
            _mSpareBlocks.Push(b);
        }

        #endregion

        // Attributes
        private readonly StringBuilder _mStringBuilder;
        private readonly StringBuilder _mStringBuilderFinal;
        private readonly StringScanner _mStringScanner;
        private readonly Dictionary<string, LinkDefinition> _mLinkDefinitions;
        private readonly Dictionary<string, Block> _mFootnotes;
        private readonly List<Block> _mUsedFootnotes;
        private readonly Dictionary<string, bool> _mUsedHeaderIDs;
        private Dictionary<string, Abbreviation> _mAbbreviationMap;
        private List<Abbreviation> _mAbbreviationList;


    }

}
