// Excerpt of OpenMU VersionSeasonSix/Items/GensRewardItems.cs (MIT, (c) 2017 MUnique; see NOTICE). Test fixture only.
namespace MUnique.OpenMU.Persistence.Initialization.VersionSeasonSix.Items;

public class GensRewardItems : InitializerBase
{
    private const byte ItemGroup = 14;

    internal static void CreateCase(IContext context, GameConfiguration gameConfiguration, (short Number, LocalizedString Name) jewelleryCase)
    {
        var (number, name) = jewelleryCase;
        var item = context.CreateNew<ItemDefinition>();
        item.Group = ItemGroup;
        item.Number = number;
        item.Name = name;
    }
}
