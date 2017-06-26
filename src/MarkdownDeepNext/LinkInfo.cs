namespace MarkdownDeep
{
    internal class LinkInfo
    {
        public LinkInfo(LinkDefinition def, string linkText)
        {
            Def = def;
            LinkText = linkText;
        }

        public LinkDefinition Def;
        public string LinkText;
    }

}
